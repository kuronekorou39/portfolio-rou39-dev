import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type MemoData, type MemoTab } from './api';
import { saveSnapshot } from './offline';

/**
 * メモ画面の自動保存エンジン。
 *
 * - タブ毎に debounce(入力停止から約3秒、打ち続けても最長10秒)して保存。IME 変換中は
 *   予約しない。サーバは version 楽観ロック(409)+
 *   per-token スロットル(429)+ 60KB 上限(413)で守られている。
 * - 編集は即座に localStorage の dirty バッファへも書き、サーバ ACK(200+新version)
 *   まで消さない。通信断・タブ強制終了でも編集はローカルに残る。
 * - ページ離脱(visibilitychange hidden / pagehide)時は全 dirty タブを
 *   /m/flush に一括送信(1回のスロットル消費)+ fetch keepalive。
 * - 409 は黙って上書きせず conflict 状態にして UI に調停させる。
 * - タブ本文は遅延読み込み。開いたタブの本文だけサーバから取り、ポーリングは
 *   手元の rev を送って「変更なし」なら本文抜きの応答で済ませる。
 *
 * このファイルは lib/auth を import しない(メモ画面チャンクの隔離)。
 */

export interface TabState {
  tab_id: string;
  title: string;
  content: string;
  version: number;
  position: number;
  /** 本文をサーバから取得済みか。false の間は content は空で、表示時に loadTab で取る。 */
  loaded: boolean;
  dirty: boolean;
  /**
   * 保存状態。'revoked'/'auth'/'create_failed' は終端(=これ以上保存できない。リトライしない)。
   * 'revoked'=URLが無効化/期限切れ/削除(404)、'auth'=PINが変更された(401)、
   * 'create_failed'=タブ自体をサーバに作れなかった。
   * いずれも dirty バッファは保持するので、新URL/新PINで開き直せば編集を復旧できる。
   */
  save: 'saved' | 'saving' | 'retrying' | 'conflict' | 'too_large' | 'revoked' | 'auth' | 'create_failed';
  /** 409 時のサーバ現在値(調停 UI 用)。 */
  conflictCurrent?: { title: string; content: string; version: number };
  /**
   * サーバへの作成がまだ完了していない(楽観追加中)。
   * この間は本文保存を送らない(サーバにタブが無いので 404 になる)。作成完了後に送る。
   */
  pendingCreate?: boolean;
  /** create_failed のときの理由コード(UI の文言出し分け用)。 */
  createError?: string | null;
}

/**
 * 入力が止まってから保存するまでの待ち。日本語入力は変換のたびに手が止まるので、
 * 短いと文を考えながら打つだけで数秒おきに本文全体が飛ぶ。
 */
const DEBOUNCE_MS = 3000;
/** 打ち続けていても、最初の編集からこの時間以内には必ず一度保存する(消失の不安を抑える)。 */
const MAX_WAIT_MS = 10_000;
const MAX_RETRY_DELAY_MS = 15_000;
/** タブ作成の再試行回数(429 やネットワーク断のとき)。使い切ったら create_failed。 */
const CREATE_MAX_RETRY = 3;
/** サーバが tab_limit を返さなかったとき(旧API)の既定。backend limits.ts の無料枠と一致させる。 */
export const DEFAULT_TAB_LIMIT = 10;
/**
 * サーバ側の変更を取り込む間隔。表示中のときだけ動かす。
 * 変更が無ければ本文抜きの小さな応答で済むので、短めでも通信量は増えない。
 */
const SYNC_INTERVAL_MS = 30_000;
/**
 * 自分の作成/削除がサーバの読みに反映されるまでの猶予。
 * サーバは強整合で読むようになったが、作成リクエストの完了前に同期が走る窓は残るので維持する。
 */
const STALE_READ_GRACE_MS = 15_000;

/** localStorage キー。メモ単位の状態はここに集約する(トークンは絶対に保存しない)。 */
export const lastTabKey = (memoId: string) => `notes_last_tab_${memoId}`;
export const seenIpsKey = (memoId: string) => `notes_seen_ips_${memoId}`;

function newTabId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // randomUUID 非対応環境向けのフォールバック(サーバ側の UUID 形式チェックを満たす)
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

interface DirtyBuffer {
  title: string;
  content: string;
  base_version: number;
  ts: number;
}

const BUF_PREFIX = 'notes_dirty_';
const bufKey = (tabId: string) => `${BUF_PREFIX}${tabId}`;

/**
 * この端末に未送信編集(dirty バッファ)が残っているタブ id の一覧。
 * 初回ロードでこれらの本文を一緒に要求し、起動時にバッファ調停(自動復元 or 競合)を走らせる
 * (遅延読み込みで本文が来ないタブは調停されず、編集が送られないままになるため)。
 */
export function bufferedTabIds(): string[] {
  const ids: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(BUF_PREFIX)) ids.push(k.slice(BUF_PREFIX.length));
    }
  } catch {
    /* localStorage 不可。調停は開いたときに行われる */
  }
  return ids;
}

export function readBuffer(tabId: string): DirtyBuffer | null {
  try {
    const s = localStorage.getItem(bufKey(tabId));
    return s ? (JSON.parse(s) as DirtyBuffer) : null;
  } catch {
    return null;
  }
}

function writeBuffer(tabId: string, buf: DirtyBuffer): void {
  try {
    localStorage.setItem(bufKey(tabId), JSON.stringify(buf));
  } catch {
    // 容量超過等。バッファは安全網なので失敗しても編集は続行できる
  }
}

export function clearBuffer(tabId: string): void {
  try {
    localStorage.removeItem(bufKey(tabId));
  } catch {
    /* noop */
  }
}

/**
 * サーバのタブをローカル状態にする。本文付きなら前回セッションの未送信編集(dirty バッファ)と調停:
 * - サーバ version がバッファ取得時と同じ → 誰も書いていないので自動復元(自動保存が押し込む)
 * - サーバが進んでいる → 勝手に上書きせず conflict としてユーザーに選ばせる
 * 本文無し(未読み込み)のタブはメタだけ持ち、バッファの調停は loadTab で本文が来たときに行う。
 */
function fromServer(t: MemoTab): TabState {
  const base = { tab_id: t.tab_id, title: t.title, version: t.version, position: t.position };
  if (t.content === undefined) {
    return { ...base, content: '', loaded: false, dirty: false, save: 'saved' };
  }
  const buf = readBuffer(t.tab_id);
  if (buf && (buf.content !== t.content || buf.title !== t.title)) {
    // base がサーバと同じ=誰も書いていない。base がサーバより新しい=手元のビュー(オフライン
    // スナップショット等)が古いだけで競合ではない。どちらも自動復元する(本当に衝突していれば
    // 保存時の 409 で調停に回る)。
    if (buf.base_version >= t.version) {
      return {
        ...base,
        title: buf.title,
        content: buf.content,
        version: Math.max(t.version, buf.base_version),
        loaded: true,
        dirty: true,
        save: 'saved',
      };
    }
    return {
      ...base,
      title: buf.title,
      content: buf.content,
      loaded: true,
      dirty: true,
      save: 'conflict',
      conflictCurrent: { title: t.title, content: t.content, version: t.version },
    };
  }
  if (buf) clearBuffer(t.tab_id); // サーバと同一内容なら残骸を掃除
  return { ...base, content: t.content, loaded: true, dirty: false, save: 'saved' };
}

export function useAutosave(token: string, initial: MemoData, pin?: string) {
  const [tabs, setTabs] = useState<TabState[]>(() => initial.tabs.map(fromServer));
  const tabLimit = initial.tab_limit ?? DEFAULT_TAB_LIMIT;

  const tabsRef = useRef<TabState[]>(tabs);
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const retryCountRef = useRef(new Map<string, number>());
  /** 直近の保存以降で最初に編集した時刻(tab_id →epoch ms)。MAX_WAIT の起点。 */
  const firstEditRef = useRef(new Map<string, number>());

  // ---- サーバ既知の状態(rev とタブのキャッシュ) ----

  /**
   * 手元が取り込み済みのメモの変更カウンタ。null は不明(次回はフル取得)。
   * 自分の保存で返った rev が「ちょうど +1」のときだけ進める。飛んでいたら他端末の変更が
   * 挟まっているので、進めずに次回ポーリングで取り込ませる。
   */
  const revRef = useRef<number | null>(initial.rev ?? null);
  const adoptRev = (rev: number | null | undefined, bumps = 1) => {
    if (typeof rev !== 'number' || revRef.current === null) return;
    if (rev === revRef.current + bumps) revRef.current = rev;
  };

  /**
   * サーバが返した内容のキャッシュ(本文はサーバ ACK 済みのものだけ)。オフライン用の
   * スナップショットはここから作る。ローカルの未保存編集を混ぜると、次回ロード時に
   * 「サーバと同一」と誤判定してバッファが捨てられ、編集が永遠に送られなくなる。
   */
  const serverTabsRef = useRef(new Map<string, MemoTab>(initial.tabs.map((t) => [t.tab_id, t])));
  const headRef = useRef<Omit<MemoData, 'tabs' | 'access_log' | 'unchanged'>>({
    memo: initial.memo,
    mode: initial.mode,
    has_pin: initial.has_pin,
    rev: initial.rev,
    tab_limit: initial.tab_limit,
  });

  /** 直近のサーバ既知ビュー(アクセス履歴の表示と、オフライン用スナップショットの元)。 */
  const [latest, setLatest] = useState<MemoData>(initial);
  const [syncing, setSyncing] = useState(false);
  const accessLogRef = useRef<MemoData['access_log']>(initial.access_log);

  /** refs からサーバ既知ビューを組み立てて公開する(スナップショット更新の起点)。 */
  const publishLatest = useCallback(() => {
    setLatest({
      ...headRef.current,
      tabs: [...serverTabsRef.current.values()].sort((a, b) => a.position - b.position),
      access_log: accessLogRef.current,
    });
  }, []);

  /**
   * 直近で自分が作成/削除したタブ(tab_id → 猶予の期限)。
   * この猶予の間はサーバ側の欠落/存在を信用しない(「作ったばかりのタブが消える」
   * 「消したタブが復活する」を防ぐ)。
   */
  const graceRef = useRef(new Map<string, { until: number; kind: 'created' | 'deleted' }>());
  const markGrace = useCallback((tabId: string, kind: 'created' | 'deleted') => {
    graceRef.current.set(tabId, { until: Date.now() + STALE_READ_GRACE_MS, kind });
  }, []);
  const graceOf = (id: string) => {
    const g = graceRef.current.get(id);
    if (g && g.until <= Date.now()) {
      graceRef.current.delete(id);
      return undefined;
    }
    return g;
  };

  const rememberServer = useCallback(
    (data: MemoData) => {
      const { memo, mode, has_pin, rev, tab_limit } = data;
      headRef.current = { memo, mode, has_pin, rev, tab_limit };
      const accessLogJson = JSON.stringify(data.access_log ?? []);
      // 「変更なし」でアクセス履歴も同じなら何もしない(30秒ごとにスナップショットを書き直さない)
      if (data.unchanged && accessLogJson === JSON.stringify(accessLogRef.current ?? [])) return;
      accessLogRef.current = data.access_log;
      if (!data.unchanged) {
        const next = new Map<string, MemoTab>();
        for (const s of data.tabs) {
          if (graceOf(s.tab_id)?.kind === 'deleted') continue; // 消したばかりのタブは戻さない
          const prev = serverTabsRef.current.get(s.tab_id);
          // 本文が来なかったタブは、version が変わっていなければ前回の本文を保つ
          const content =
            s.content !== undefined ? s.content : prev && prev.version === s.version ? prev.content : undefined;
          next.set(s.tab_id, { ...s, content });
        }
        // 作ったばかりで応答に欠けているタブは保つ(反映前の読み)
        for (const [id, prev] of serverTabsRef.current) {
          if (!next.has(id) && graceOf(id)?.kind === 'created') next.set(id, prev);
        }
        serverTabsRef.current = next;
      }
      publishLatest();
    },
    // graceOf は ref しか触らない
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [publishLatest],
  );

  // サーバ既知ビューが更新されるたびにオフライン用スナップショットを更新する
  // (保存のたびに書くと数秒おきに IndexedDB へメモ全体が乗るので、少し待って最後の 1 回だけ書く)
  useEffect(() => {
    const timer = setTimeout(() => void saveSnapshot(token, latest).catch(() => {}), 1500);
    return () => clearTimeout(timer);
  }, [token, latest]);

  // ---- 保存 ----

  /**
   * debounce 保存を(再)予約する。入力のたびに呼ばれ、前の予約は取り消す。
   * ただし最初の編集から MAX_WAIT を超えそうなら、その残り時間で発火させる
   * (入力が続く限り永遠に保存されない、を防ぐ)。
   */
  const armSave = useCallback((tabId: string, save: (id: string) => void) => {
    const now = Date.now();
    const first = firstEditRef.current.get(tabId) ?? now;
    firstEditRef.current.set(tabId, first);
    const delay = Math.max(0, Math.min(DEBOUNCE_MS, first + MAX_WAIT_MS - now));
    const existing = timersRef.current.get(tabId);
    if (existing) clearTimeout(existing);
    timersRef.current.set(tabId, setTimeout(() => save(tabId), delay));
  }, []);

  const patchTab = useCallback((tabId: string, patch: Partial<TabState>) => {
    setTabs((prev) => prev.map((t) => (t.tab_id === tabId ? { ...t, ...patch } : t)));
  }, []);

  /**
   * バッファから復元した未送信編集(dirty で予約が無いタブ)の保存を予約する。
   * 起動時と、遅延読み込み/同期でサーバ応答を取り込んだ直後にだけ走らせる
   * (入力のたびに走らせると IME 変換中に止めた予約を戻してしまう)。
   */
  const armPendingRef = useRef(true);

  /** 保存が通った内容をサーバ既知キャッシュへ反映する(スナップショットの元)。 */
  const rememberSaved = useCallback(
    (tabId: string, saved: { title: string; content: string; version: number }) => {
      const prev = serverTabsRef.current.get(tabId);
      if (prev) serverTabsRef.current.set(tabId, { ...prev, ...saved });
      publishLatest(); // 保存 ACK 済みの本文をスナップショットにも反映(古い版での偽競合を防ぐ)
    },
    [publishLatest],
  );

  const saveNow = useCallback(
    async (tabId: string): Promise<void> => {
      const t = tabsRef.current.find((x) => x.tab_id === tabId);
      if (
        !t ||
        !t.dirty ||
        // 作成がまだサーバに届いていない間は送らない(404 になる)。作成完了時に送り直す
        t.pendingCreate ||
        t.save === 'conflict' ||
        t.save === 'saving' ||
        t.save === 'revoked' ||
        t.save === 'auth' ||
        t.save === 'create_failed'
      )
        return;

      const snapshot = { title: t.title, content: t.content, base_version: t.version };
      firstEditRef.current.delete(tabId); // ここから先の編集は新しい MAX_WAIT 窓
      patchTab(tabId, { save: 'saving' });
      try {
        const r = await api.saveTab(token, { tab_id: tabId, ...snapshot }, pin);
        adoptRev(r.rev);
        rememberSaved(tabId, { title: snapshot.title, content: snapshot.content, version: r.version });
        retryCountRef.current.delete(tabId);
        const cur = tabsRef.current.find((x) => x.tab_id === tabId);
        const unchanged =
          !!cur && cur.title === snapshot.title && cur.content === snapshot.content;
        if (unchanged) {
          clearBuffer(tabId);
        } else {
          // 送信中にさらに編集された。新 version でバッファを更新し、再度 debounce
          if (cur) writeBuffer(tabId, { title: cur.title, content: cur.content, base_version: r.version, ts: Date.now() });
          armSave(tabId, (id) => void saveNow(id));
        }
        patchTab(tabId, { version: r.version, dirty: !unchanged, save: 'saved' });
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          const current = (e.body as { current?: TabState['conflictCurrent'] }).current;
          patchTab(tabId, { save: 'conflict', conflictCurrent: current });
          return;
        }
        if (e instanceof ApiError && e.status === 413) {
          patchTab(tabId, { save: 'too_large' });
          return;
        }
        if (e instanceof ApiError && e.status === 404) {
          // URL が無効化/期限切れ/削除。以後の保存は不可能=終端(リトライしない)。
          // dirty バッファは残すので、新しいURLで開き直せば編集を復旧できる。
          retryCountRef.current.delete(tabId);
          patchTab(tabId, { save: 'revoked' });
          return;
        }
        if (e instanceof ApiError && e.status === 401) {
          // セッション中に PIN が設定/変更された(pin_required/pin_incorrect)。古いPINでの
          // 保存はもう通らない=終端。リトライで送り続けると pin_fail_count を消費してトークンを
          // 自己ロックするため、必ずここで止める。バッファは残す(再読み込み+新PINで復旧可)。
          retryCountRef.current.delete(tabId);
          patchTab(tabId, { save: 'auth' });
          return;
        }
        // 429 / ネットワーク断 / 5xx → 指数バックオフでリトライ(バッファは保持)
        const n = (retryCountRef.current.get(tabId) ?? 0) + 1;
        retryCountRef.current.set(tabId, n);
        const delay = Math.min(2000 * 2 ** (n - 1), MAX_RETRY_DELAY_MS);
        patchTab(tabId, { save: 'retrying' });
        const timer = setTimeout(() => void saveNow(tabId), delay);
        timersRef.current.set(tabId, timer);
      }
    },
    [token, pin, patchTab, armSave, rememberSaved],
  );

  /**
   * 編集入力。state 更新 + dirty バッファ書き込み + debounce 保存予約。
   * composing=true(IME 変換中)のときは予約しない。変換中は onChange が連続して来るが、
   * 確定前の途中文字列を保存しても無駄なので、確定後に kick() で予約し直す。
   */
  const edit = useCallback(
    (tabId: string, patch: { title?: string; content?: string }, opts: { composing?: boolean } = {}) => {
      const t = tabsRef.current.find((x) => x.tab_id === tabId);
      if (!t || !t.loaded) return;
      const next = { title: patch.title ?? t.title, content: patch.content ?? t.content };
      writeBuffer(tabId, { ...next, base_version: t.version, ts: Date.now() });
      // 終端(revoked/auth/create_failed)後は編集をローカルバッファに残すだけでサーバ保存は試みない。
      // 特に auth(PIN変更)で再送し続けると pin_fail_count を消費してトークンを自己ロックするため、
      // 入力があってもサーバ保存を再アームしない(復旧は新URL/新PINで開き直したとき)。
      const terminal = t.save === 'revoked' || t.save === 'auth' || t.save === 'create_failed';
      patchTab(tabId, {
        ...next,
        dirty: true,
        // too_large は書き直しで解除を試みる。conflict は調停まで維持。終端はそのまま維持。
        save: terminal
          ? t.save
          : t.save === 'conflict'
            ? 'conflict'
            : t.save === 'saving'
              ? 'saving'
              : 'saved',
      });
      // 作成中は debounce だけ張っておく(saveNow 側が pendingCreate を見て送信を見送り、
      // 作成完了時に改めて送られる)。
      if (terminal) return;
      if (opts.composing) {
        // 変換中に前の予約が発火しないよう止める(MAX_WAIT の起点は維持する)
        const existing = timersRef.current.get(tabId);
        if (existing) clearTimeout(existing);
        if (!firstEditRef.current.has(tabId)) firstEditRef.current.set(tabId, Date.now());
        return;
      }
      armSave(tabId, (id) => void saveNow(id));
    },
    [patchTab, saveNow, armSave],
  );

  /** 未保存の編集があれば保存を予約し直す(IME 確定後など、edit を経ずに再アームしたいとき)。 */
  const kick = useCallback(
    (tabId: string) => {
      const t = tabsRef.current.find((x) => x.tab_id === tabId);
      if (!t?.dirty) return;
      if (t.save === 'revoked' || t.save === 'auth' || t.save === 'create_failed') return;
      armSave(tabId, (id) => void saveNow(id));
    },
    [saveNow, armSave],
  );

  /** 全 dirty タブの一括保存(タブ切替・離脱時)。1回のスロットル消費で送る。 */
  const flushAll = useCallback(
    (keepalive: boolean) => {
      // 終端(revoked/auth/create_failed)のタブと、まだサーバに作られていないタブは送らない
      // (送っても 404/401 で無駄。auth は失敗回数も消費する)。
      const dirty = tabsRef.current.filter(
        (t) =>
          t.dirty &&
          !t.pendingCreate &&
          t.save !== 'conflict' &&
          t.save !== 'revoked' &&
          t.save !== 'auth' &&
          t.save !== 'create_failed',
      );
      if (dirty.length === 0) return;
      void api
        .flush(
          token,
          dirty.map((t) => ({
            tab_id: t.tab_id,
            base_version: t.version,
            title: t.title,
            content: t.content,
          })),
          { keepalive, pin },
        )
        .then(({ results, rev }) => {
          let okCount = 0;
          for (const r of results) {
            if (r.result === 'ok' && r.version !== undefined) {
              okCount++;
              const cur = tabsRef.current.find((x) => x.tab_id === r.tab_id);
              const sent = dirty.find((x) => x.tab_id === r.tab_id);
              if (sent) rememberSaved(r.tab_id, { title: sent.title, content: sent.content, version: r.version });
              const unchanged =
                !!cur && !!sent && cur.title === sent.title && cur.content === sent.content;
              if (unchanged) clearBuffer(r.tab_id);
              // 送信後にさらに編集されていたら、バッファの基準 version を新しい版に合わせる
              // (古いままだと次回ロードで偽の競合になる)
              else if (cur) writeBuffer(r.tab_id, { title: cur.title, content: cur.content, base_version: r.version, ts: Date.now() });
              patchTab(r.tab_id, { version: r.version, dirty: !unchanged, save: unchanged ? 'saved' : 'retrying' });
            } else if (r.result === 'conflict') {
              // 画面がまだ生きていれば個別保存で 409 を踏み直し、調停バナーを出す
              // (スロットル窓を跨ぐよう少し待つ)。離脱後なら次回ロードのバッファ調停に委ねる
              const timer = setTimeout(() => void saveNow(r.tab_id), 1500);
              timersRef.current.set(r.tab_id, timer);
            }
          }
          // 成功した保存の数だけ rev が進んでいれば自分の変更だけなので取り込み済みにできる
          if (okCount > 0) adoptRev(rev, okCount);
        })
        .catch(() => {
          /* 離脱中の失敗はバッファが安全網 */
        });
    },
    [token, pin, patchTab, saveNow, rememberSaved],
  );

  /** sync はこの後で定義される(保存系より後ろ)ので、離脱/復帰ハンドラからは ref 経由で呼ぶ。 */
  const syncRef = useRef<() => Promise<unknown>>(() => Promise.resolve());

  // 離脱時フラッシュ(beforeunload ではなく visibilitychange/pagehide=モバイルで確実)
  // + オンライン復帰時は未送信の編集を即座に一括同期する(オフライン編集の同期経路)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushAll(true);
    };
    const onPageHide = () => flushAll(true);
    const onOnline = () => {
      flushAll(false);
      void syncRef.current(); // オフライン中に取れなかった分(未読み込みタブのメタ等)を取り直す
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('online', onOnline);
    const timers = timersRef.current;
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('online', onOnline);
      for (const timer of timers.values()) clearTimeout(timer);
    };
  }, [flushAll]);

  /** 409 調停: サーバ版を採用(ローカル編集は破棄。バッファも消す)。 */
  const adoptServer = useCallback(
    (tabId: string) => {
      const t = tabsRef.current.find((x) => x.tab_id === tabId);
      if (!t?.conflictCurrent) return;
      clearBuffer(tabId);
      patchTab(tabId, {
        title: t.conflictCurrent.title,
        content: t.conflictCurrent.content,
        version: t.conflictCurrent.version,
        dirty: false,
        save: 'saved',
        conflictCurrent: undefined,
      });
    },
    [patchTab],
  );

  /** 409 調停: ローカル編集で上書き(サーバの version を土台にして再保存)。 */
  const overwriteServer = useCallback(
    (tabId: string) => {
      const t = tabsRef.current.find((x) => x.tab_id === tabId);
      if (!t?.conflictCurrent) return;
      patchTab(tabId, {
        version: t.conflictCurrent.version,
        dirty: true,
        save: 'saved',
        conflictCurrent: undefined,
      });
      // patchTab の反映後に保存(tabsRef は effect 経由で更新されるため次tickで)
      setTimeout(() => void saveNow(tabId), 0);
    },
    [patchTab, saveNow],
  );

  /**
   * サーバへのタブ作成(裏で走る)。失敗は状態に落として UI に出す。
   * 429 やネットワーク断は数回リトライし、使い切ったら create_failed で止める。
   */
  const createOnServer = useCallback(
    async (tabId: string, position: number, attempt = 0): Promise<void> => {
      try {
        await api.createTab(token, { tab_id: tabId, title: '', position }, pin);
        // 反映前の読みで欠けていても消さないよう猶予を張る
        markGrace(tabId, 'created');
        serverTabsRef.current.set(tabId, { tab_id: tabId, title: '', content: '', version: 0, position });
        publishLatest();
        patchTab(tabId, { pendingCreate: false, save: 'saved', createError: null });
        // 作成待ちの間に入力されていたぶんを送る
        const cur = tabsRef.current.find((x) => x.tab_id === tabId);
        if (cur?.dirty) void saveNow(tabId);
      } catch (e) {
        const code = e instanceof ApiError ? e.code : null;
        const status = e instanceof ApiError ? e.status : 0;
        // 上限超過・URL無効・PIN変更はリトライしても通らない(PIN は失敗回数も消費する)
        if (status === 409 || status === 404 || status === 401) {
          patchTab(tabId, { pendingCreate: false, save: 'create_failed', createError: code });
          return;
        }
        if (attempt >= CREATE_MAX_RETRY) {
          patchTab(tabId, { pendingCreate: false, save: 'create_failed', createError: code });
          return;
        }
        const delay = Math.min(1200 * 2 ** attempt, MAX_RETRY_DELAY_MS);
        const timer = setTimeout(() => void createOnServer(tabId, position, attempt + 1), delay);
        timersRef.current.set(`create_${tabId}`, timer);
      }
    },
    [token, pin, patchTab, saveNow, markGrace, publishLatest],
  );

  /**
   * タブ追加。**UI には即座に出し、サーバ作成は裏で走らせる**(+ を押した瞬間に使えるように)。
   * tab_id はここで採番して送るので、成功後に ID を差し替える必要がない
   * (差し替えると dirty バッファや debounce タイマーのキーがずれる)。
   * 戻り値は追加したタブの id。上限に達している場合は null。
   */
  const addTab = useCallback((): string | null => {
    if (tabsRef.current.length >= tabLimit) return null;
    const tabId = newTabId();
    const position = Math.max(-1, ...tabsRef.current.map((t) => t.position)) + 1;
    setTabs((prev) => [
      ...prev,
      {
        tab_id: tabId,
        title: '',
        content: '',
        version: 0,
        position,
        loaded: true, // 新規タブは空なので本文は手元にある
        dirty: false,
        save: 'saving',
        pendingCreate: true,
      },
    ]);
    void createOnServer(tabId, position);
    return tabId;
  }, [createOnServer, tabLimit]);

  /** create_failed になったタブの作成をやり直す。 */
  const retryCreate = useCallback(
    (tabId: string) => {
      const t = tabsRef.current.find((x) => x.tab_id === tabId);
      if (!t || t.save !== 'create_failed') return;
      patchTab(tabId, { pendingCreate: true, save: 'saving', createError: null });
      void createOnServer(tabId, t.position);
    },
    [createOnServer, patchTab],
  );

  /**
   * タブの並べ替え。UI は即座に入れ替え、サーバへは 1 リクエストで送る。
   * 失敗しても本文は失われない(position だけの話)ので、次回取得時に元の順序へ戻る。
   */
  const reorder = useCallback(
    async (orderedIds: string[]): Promise<boolean> => {
      // 楽観適用: 渡された順に position を振り直す
      setTabs((prev) => {
        const byId = new Map(prev.map((t) => [t.tab_id, t]));
        const next = orderedIds.map((id, i) => {
          const t = byId.get(id);
          return t ? { ...t, position: i } : t;
        });
        return next.filter((t): t is TabState => !!t);
      });
      // 作成が未完了のタブが混ざっていると 409 になるので、確定分だけ送る
      const known = orderedIds.filter(
        (id) => !tabsRef.current.find((t) => t.tab_id === id)?.pendingCreate,
      );
      if (known.length === 0) return true;
      try {
        const r = await api.reorderTabs(token, known, pin);
        adoptRev(r.rev);
        return true;
      } catch {
        return false;
      }
    },
    [token, pin],
  );

  /** タブ削除(最後の1枚はサーバ側で拒否される)。 */
  const removeTab = useCallback(
    async (tabId: string): Promise<boolean> => {
      const dropLocal = () => {
        // 反映前の読みで返ってきても復活させないよう猶予を張る
        markGrace(tabId, 'deleted');
        clearBuffer(tabId);
        firstEditRef.current.delete(tabId);
        serverTabsRef.current.delete(tabId);
        publishLatest();
        for (const key of [tabId, `create_${tabId}`]) {
          const timer = timersRef.current.get(key);
          if (timer) clearTimeout(timer);
          timersRef.current.delete(key);
        }
        setTabs((prev) => prev.filter((t) => t.tab_id !== tabId));
      };

      // 作成に失敗したタブはサーバに存在しないので、ローカルから消すだけでよい
      if (tabsRef.current.find((t) => t.tab_id === tabId)?.save === 'create_failed') {
        dropLocal();
        return true;
      }
      try {
        await api.deleteTab(token, tabId, pin);
        dropLocal();
        return true;
      } catch (e) {
        // 既にサーバに無い(別端末で削除済み等)なら、ローカルも合わせて消す
        if (e instanceof ApiError && e.status === 404) {
          dropLocal();
          return true;
        }
        return false;
      }
    },
    [token, pin, markGrace, publishLatest],
  );

  // ---- サーバ側の変更の取り込み ----

  /** 401/404 を観測したら以後の取得を止める。401 を叩き続けるとトークンを自己ロックするため。 */
  const syncStoppedRef = useRef(false);

  /**
   * サーバのタブ一覧をローカル状態に合流させる。
   *
   * - 未読み込みのタブ → 本文が来ていれば読み込み済みにする(バッファ調停込み)。無ければメタだけ更新
   * - 未編集 かつ サーバの version が進んでいる → 黙って置き換える(これが本命)
   * - 編集中 かつ サーバが進んでいる → 競合 UI に載せる
   * - 送信中/作成中/終端のタブは触らない(進行中の状態を壊さない)
   */
  const mergeServerTabs = useCallback((serverTabs: MemoTab[]) => {
    setTabs((prev) => {
      const prevById = new Map(prev.map((t) => [t.tab_id, t]));
      const serverIds = new Set(serverTabs.map((t) => t.tab_id));
      const merged: TabState[] = [];

      for (const s of serverTabs) {
        // 自分が消したばかりのタブが反映前の読みで返ってきた。復活させない
        if (graceOf(s.tab_id)?.kind === 'deleted') continue;
        const local = prevById.get(s.tab_id);
        if (!local) {
          merged.push(fromServer(s)); // 別端末で増えたタブ
          continue;
        }
        const busy =
          local.pendingCreate ||
          local.save === 'saving' ||
          local.save === 'conflict' ||
          local.save === 'revoked' ||
          local.save === 'auth' ||
          local.save === 'create_failed';
        if (busy) {
          merged.push({ ...local, position: s.position });
          continue;
        }
        if (!local.loaded) {
          // 本文が来たなら読み込み完了。来ていなければタブ名などのメタだけ追従
          merged.push(
            s.content !== undefined
              ? fromServer(s)
              : { ...local, title: s.title, version: s.version, position: s.position },
          );
          continue;
        }
        if (s.version <= local.version) {
          merged.push({ ...local, position: s.position });
          continue;
        }
        if (s.content === undefined) {
          // version は進んだが本文は要求に含まれていなかった(読み込み中に同期が走った等)。
          // 未編集なら未読み込みに戻して表示時に取り直す。編集中なら保存時の 409 に任せる
          merged.push(
            local.dirty
              ? { ...local, position: s.position }
              : { ...local, title: s.title, version: s.version, position: s.position, content: '', loaded: false },
          );
          continue;
        }
        if (!local.dirty) {
          clearBuffer(s.tab_id);
          merged.push({
            ...local,
            title: s.title,
            content: s.content,
            version: s.version,
            position: s.position,
            dirty: false,
            save: 'saved',
          });
        } else {
          merged.push({
            ...local,
            position: s.position,
            save: 'conflict',
            conflictCurrent: { title: s.title, content: s.content, version: s.version },
          });
        }
      }

      // サーバに無いタブ。未編集なら消し、編集中・作成中のものは残す
      // (残したものは保存時に 404 を踏んで revoked になり、バッファから復旧できる)。
      // 作ったばかりのタブは、反映前の読みで欠けているだけかもしれないので消さない。
      for (const t of prev) {
        if (serverIds.has(t.tab_id)) continue;
        const justCreated = graceOf(t.tab_id)?.kind === 'created';
        if (justCreated || t.dirty || t.pendingCreate || t.save === 'create_failed') merged.push(t);
      }

      return merged.sort((a, b) => a.position - b.position);
    });
  }, []);

  /** サーバ応答(フル取得)を取り込む共通処理。 */
  const applyServer = useCallback(
    (data: MemoData) => {
      rememberServer(data);
      if (data.unchanged) return;
      revRef.current = data.rev ?? null;
      armPendingRef.current = true; // 取り込みでバッファ復元された dirty タブがあれば保存を予約する
      mergeServerTabs(data.tabs);
    },
    [rememberServer, mergeServerTabs],
  );

  const sync = useCallback(async (): Promise<'ok' | 'stopped' | 'error'> => {
    if (syncStoppedRef.current) return 'stopped';
    setSyncing(true);
    try {
      // 本文は読み込み済みのタブぶんだけ、しかも手元の version と違うものだけ要求する
      // (未読み込みのタブは表示時に取る。同じ version のタブはメタだけ返る)
      const loadedIds = tabsRef.current
        .filter((t) => t.loaded && !t.pendingCreate)
        .map((t) => ({ tab_id: t.tab_id, version: t.version }));
      const data = await api.getMemo(token, pin, {
        knownRev: revRef.current ?? undefined,
        tabIds: loadedIds,
      });
      applyServer(data);
      return 'ok';
    } catch (e) {
      // PIN が変更された(401)/ URL が無効化された(404)。以後の取得を止める。
      // 特に 401 のまま叩き続けると pin_fail_count を消費してトークンが自己ロックする。
      if (e instanceof ApiError && (e.status === 401 || e.status === 404)) {
        syncStoppedRef.current = true;
        return 'stopped';
      }
      return 'error'; // 一時的な失敗。次の周期で取り直す
    } finally {
      setSyncing(false);
    }
  }, [token, pin, applyServer]);

  syncRef.current = sync;

  useEffect(() => {
    if (!armPendingRef.current) return;
    armPendingRef.current = false;
    for (const t of tabs) {
      if (t.dirty && t.save === 'saved' && !t.pendingCreate && !timersRef.current.has(t.tab_id)) {
        armSave(t.tab_id, (id) => void saveNow(id));
      }
    }
  }, [tabs, armSave, saveNow]);

  /** 読み込み中のタブ → その Promise。二重要求を抑止しつつ、後から呼んだ側にも実結果を返す。 */
  const loadingRef = useRef(new Map<string, Promise<'ok' | 'stopped' | 'error'>>());

  /**
   * 未読み込みタブの本文を取得する(タブを開いたとき)。
   * 応答には全タブのメタも載るので、ついでに同期も進む。
   * 'stopped' は URL 失効/PIN 変更(401/404)で、以後は取得しない(401 を叩き続けると
   * pin_fail_count を消費してトークンを自己ロックするため。再読み込みボタンも出さないこと)。
   * 'error' はオフライン等の一時的な失敗。
   */
  const loadTab = useCallback(
    (tabId: string): Promise<'ok' | 'stopped' | 'error'> => {
      if (syncStoppedRef.current) return Promise.resolve('stopped');
      const t = tabsRef.current.find((x) => x.tab_id === tabId);
      if (!t || t.loaded) return Promise.resolve('ok');
      const inflight = loadingRef.current.get(tabId);
      if (inflight) return inflight;
      const p = (async (): Promise<'ok' | 'stopped' | 'error'> => {
        try {
          const data = await api.getMemo(token, pin, { tabIds: [tabId] });
          applyServer(data);
          return 'ok';
        } catch (e) {
          if (e instanceof ApiError && (e.status === 401 || e.status === 404)) {
            syncStoppedRef.current = true;
            return 'stopped';
          }
          return 'error';
        } finally {
          loadingRef.current.delete(tabId);
        }
      })();
      loadingRef.current.set(tabId, p);
      return p;
    },
    [token, pin, applyServer],
  );

  // 画面に戻ったとき + 表示中は一定間隔で、サーバの変更を取り込む。
  // 非表示のときは動かさない(裏で読み取りを撃ち続けない)。
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void sync();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    const interval = setInterval(onVisible, SYNC_INTERVAL_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      clearInterval(interval);
    };
  }, [sync]);

  return {
    tabs,
    /** このメモのタブ数上限。 */
    tabLimit,
    edit,
    kick,
    saveNow,
    flushAll,
    adoptServer,
    overwriteServer,
    addTab,
    retryCreate,
    removeTab,
    reorder,
    loadTab,
    sync,
    syncing,
    /** 直近のサーバ既知ビュー(アクセス履歴の表示に使う)。 */
    latest,
  };
}
