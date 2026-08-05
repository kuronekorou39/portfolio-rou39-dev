import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type MemoData } from './api';

/**
 * メモ画面の自動保存エンジン。
 *
 * - タブ毎に debounce(約1.3秒)して保存。サーバは version 楽観ロック(409)+
 *   per-token スロットル(429)+ 60KB 上限(413)で守られている。
 * - 編集は即座に localStorage の dirty バッファへも書き、サーバ ACK(200+新version)
 *   まで消さない。通信断・タブ強制終了でも編集はローカルに残る。
 * - ページ離脱(visibilitychange hidden / pagehide)時は全 dirty タブを
 *   /m/flush に一括送信(1回のスロットル消費)+ fetch keepalive。
 * - 409 は黙って上書きせず conflict 状態にして UI に調停させる。
 *
 * このファイルは lib/auth を import しない(メモ画面チャンクの隔離)。
 */

export interface TabState {
  tab_id: string;
  title: string;
  content: string;
  version: number;
  position: number;
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

const DEBOUNCE_MS = 1300;
const MAX_RETRY_DELAY_MS = 15_000;
/** タブ作成の再試行回数(429 やネットワーク断のとき)。使い切ったら create_failed。 */
const CREATE_MAX_RETRY = 3;
/** backend limits.ts の MAX_TABS_PER_MEMO と一致させる。 */
export const MAX_TABS_PER_MEMO = 12;
/**
 * サーバ側の変更を取り込む間隔。表示中のときだけ動かす。
 * 短くするほど反映は速いが /m/get の読み取り回数がそのまま増える。
 */
const SYNC_INTERVAL_MS = 30_000;
/**
 * 自分の作成/削除がサーバの読みに反映されるまでの猶予。
 * /m/get のタブ取得は結果整合なので、この間はサーバ側の欠落/存在を信用しない。
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

const bufKey = (tabId: string) => `notes_dirty_${tabId}`;

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

export function useAutosave(
  token: string,
  initialTabs: { tab_id: string; title: string; content: string; version: number; position: number }[],
  pin?: string,
) {
  const [tabs, setTabs] = useState<TabState[]>(() =>
    initialTabs.map((t) => {
      // 前回セッションの未送信編集(dirty バッファ)との調停:
      // - サーバ version がバッファ取得時と同じ → 誰も書いていないので自動復元(自動保存が押し込む)
      // - サーバが進んでいる → 勝手に上書きせず conflict としてユーザーに選ばせる
      const buf = readBuffer(t.tab_id);
      if (buf && (buf.content !== t.content || buf.title !== t.title)) {
        if (buf.base_version === t.version) {
          return { ...t, title: buf.title, content: buf.content, dirty: true, save: 'saved' as const };
        }
        return {
          ...t,
          title: buf.title,
          content: buf.content,
          dirty: true,
          save: 'conflict' as const,
          conflictCurrent: { title: t.title, content: t.content, version: t.version },
        };
      }
      if (buf) clearBuffer(t.tab_id); // サーバと同一内容なら残骸を掃除
      return { ...t, dirty: false, save: 'saved' as const };
    }),
  );

  const tabsRef = useRef<TabState[]>(tabs);
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const retryCountRef = useRef(new Map<string, number>());

  /**
   * 直近で自分が作成/削除したタブ(tab_id → 猶予の期限)。
   *
   * /m/get のタブ取得は結果整合なので、書いた直後は反映前の一覧が返ることがある。
   * それをそのまま合流させると「作ったばかりのタブが消える」「消したタブが復活する」
   * が起きるため、この猶予の間はサーバ側の欠落/存在を信用しない。
   */
  const graceRef = useRef(new Map<string, { until: number; kind: 'created' | 'deleted' }>());
  const markGrace = useCallback((tabId: string, kind: 'created' | 'deleted') => {
    graceRef.current.set(tabId, { until: Date.now() + STALE_READ_GRACE_MS, kind });
  }, []);

  const patchTab = useCallback((tabId: string, patch: Partial<TabState>) => {
    setTabs((prev) => prev.map((t) => (t.tab_id === tabId ? { ...t, ...patch } : t)));
  }, []);

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
      patchTab(tabId, { save: 'saving' });
      try {
        const r = await api.saveTab(token, { tab_id: tabId, ...snapshot }, pin);
        retryCountRef.current.delete(tabId);
        const cur = tabsRef.current.find((x) => x.tab_id === tabId);
        const unchanged =
          !!cur && cur.title === snapshot.title && cur.content === snapshot.content;
        if (unchanged) {
          clearBuffer(tabId);
        } else {
          // 送信中にさらに編集された。新 version でバッファを更新し、再度 debounce
          if (cur) writeBuffer(tabId, { title: cur.title, content: cur.content, base_version: r.version, ts: Date.now() });
          const timer = setTimeout(() => void saveNow(tabId), DEBOUNCE_MS);
          timersRef.current.set(tabId, timer);
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
    [token, patchTab],
  );

  /** 編集入力。state 更新 + dirty バッファ書き込み + debounce 保存予約。 */
  const edit = useCallback(
    (tabId: string, patch: { title?: string; content?: string }) => {
      const t = tabsRef.current.find((x) => x.tab_id === tabId);
      if (!t) return;
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
      const existing = timersRef.current.get(tabId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => void saveNow(tabId), DEBOUNCE_MS);
      timersRef.current.set(tabId, timer);
    },
    [patchTab, saveNow],
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
        .then(({ results }) => {
          for (const r of results) {
            if (r.result === 'ok' && r.version !== undefined) {
              const cur = tabsRef.current.find((x) => x.tab_id === r.tab_id);
              const sent = dirty.find((x) => x.tab_id === r.tab_id);
              const unchanged =
                !!cur && !!sent && cur.title === sent.title && cur.content === sent.content;
              if (unchanged) clearBuffer(r.tab_id);
              patchTab(r.tab_id, { version: r.version, dirty: !unchanged, save: unchanged ? 'saved' : 'retrying' });
            } else if (r.result === 'conflict') {
              // 画面がまだ生きていれば個別保存で 409 を踏み直し、調停バナーを出す
              // (スロットル窓を跨ぐよう少し待つ)。離脱後なら次回ロードのバッファ調停に委ねる
              const timer = setTimeout(() => void saveNow(r.tab_id), 1500);
              timersRef.current.set(r.tab_id, timer);
            }
          }
        })
        .catch(() => {
          /* 離脱中の失敗はバッファが安全網 */
        });
    },
    [token, patchTab, saveNow],
  );

  // 離脱時フラッシュ(beforeunload ではなく visibilitychange/pagehide=モバイルで確実)
  // + オンライン復帰時は未送信の編集を即座に一括同期する(オフライン編集の同期経路)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushAll(true);
    };
    const onPageHide = () => flushAll(true);
    const onOnline = () => flushAll(false);
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
    [token, pin, patchTab, saveNow, markGrace],
  );

  /**
   * タブ追加。**UI には即座に出し、サーバ作成は裏で走らせる**(+ を押した瞬間に使えるように)。
   * tab_id はここで採番して送るので、成功後に ID を差し替える必要がない
   * (差し替えると dirty バッファや debounce タイマーのキーがずれる)。
   * 戻り値は追加したタブの id。上限に達している場合は null。
   */
  const addTab = useCallback((): string | null => {
    if (tabsRef.current.length >= MAX_TABS_PER_MEMO) return null;
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
        dirty: false,
        save: 'saving',
        pendingCreate: true,
      },
    ]);
    void createOnServer(tabId, position);
    return tabId;
  }, [createOnServer]);

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
        await api.reorderTabs(token, known, pin);
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
    [token, pin, markGrace],
  );

  // ---- サーバ側の変更の取り込み ----

  /** 401/404 を観測したら以後の取得を止める。401 を叩き続けるとトークンを自己ロックするため。 */
  const syncStoppedRef = useRef(false);
  const [latest, setLatest] = useState<MemoData | null>(null);
  const [syncing, setSyncing] = useState(false);

  /**
   * サーバのタブ一覧をローカル状態に合流させる。
   *
   * - 未編集 かつ サーバの version が進んでいる → 黙って置き換える(これが本命)
   * - 編集中 かつ サーバが進んでいる → 従来どおり競合 UI に載せる
   * - 送信中/作成中/終端のタブは触らない(進行中の状態を壊さない)
   *
   * /m/get の読みは結果整合なので、古い版が返ることがある。version が進んでいるときしか
   * 採用しないので、その場合は何も起きない(次回の取得で追いつく)。
   */
  const mergeServerTabs = useCallback((serverTabs: MemoData['tabs']) => {
    setTabs((prev) => {
      const now = Date.now();
      for (const [id, g] of graceRef.current) if (g.until <= now) graceRef.current.delete(id);
      const graceOf = (id: string) => graceRef.current.get(id);

      const prevById = new Map(prev.map((t) => [t.tab_id, t]));
      const serverIds = new Set(serverTabs.map((t) => t.tab_id));
      const merged: TabState[] = [];

      for (const s of serverTabs) {
        // 自分が消したばかりのタブが反映前の読みで返ってきた。復活させない
        if (graceOf(s.tab_id)?.kind === 'deleted') continue;
        const local = prevById.get(s.tab_id);
        if (!local) {
          merged.push({ ...s, dirty: false, save: 'saved' }); // 別端末で増えたタブ
          continue;
        }
        const busy =
          local.pendingCreate ||
          local.save === 'saving' ||
          local.save === 'conflict' ||
          local.save === 'revoked' ||
          local.save === 'auth' ||
          local.save === 'create_failed';
        if (busy || s.version <= local.version) {
          merged.push({ ...local, position: s.position });
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

  const sync = useCallback(async (): Promise<'ok' | 'stopped' | 'error'> => {
    if (syncStoppedRef.current) return 'stopped';
    setSyncing(true);
    try {
      const data = await api.getMemo(token, pin);
      setLatest(data);
      mergeServerTabs(data.tabs);
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
  }, [token, pin, mergeServerTabs]);

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
    edit,
    saveNow,
    flushAll,
    adoptServer,
    overwriteServer,
    addTab,
    retryCreate,
    removeTab,
    reorder,
    sync,
    syncing,
    /** 直近の取得結果(アクセス履歴の更新に使う)。まだ取得していなければ null。 */
    latest,
  };
}
