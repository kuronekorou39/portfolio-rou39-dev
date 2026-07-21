import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';

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
   * 保存状態。'revoked'/'auth' は終端(=これ以上保存できない。リトライしない)。
   * 'revoked'=URLが無効化/期限切れ/削除(404)、'auth'=PINが変更された(401)。
   * どちらも dirty バッファは保持するので、新URL/新PINで開き直せば編集を復旧できる。
   */
  save: 'saved' | 'saving' | 'retrying' | 'conflict' | 'too_large' | 'revoked' | 'auth';
  /** 409 時のサーバ現在値(調停 UI 用)。 */
  conflictCurrent?: { title: string; content: string; version: number };
}

const DEBOUNCE_MS = 1300;
const MAX_RETRY_DELAY_MS = 15_000;

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

  const patchTab = useCallback((tabId: string, patch: Partial<TabState>) => {
    setTabs((prev) => prev.map((t) => (t.tab_id === tabId ? { ...t, ...patch } : t)));
  }, []);

  const saveNow = useCallback(
    async (tabId: string): Promise<void> => {
      const t = tabsRef.current.find((x) => x.tab_id === tabId);
      if (
        !t ||
        !t.dirty ||
        t.save === 'conflict' ||
        t.save === 'saving' ||
        t.save === 'revoked' ||
        t.save === 'auth'
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
      // 終端(revoked/auth)後は編集をローカルバッファに残すだけでサーバ保存は試みない。
      // 特に auth(PIN変更)で再送し続けると pin_fail_count を消費してトークンを自己ロックするため、
      // 入力があってもサーバ保存を再アームしない(復旧は新URL/新PINで開き直したとき)。
      const terminal = t.save === 'revoked' || t.save === 'auth';
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
      // 終端(revoked/auth)のタブは送らない(送っても 404/401 で無駄。auth は失敗回数も消費)。
      const dirty = tabsRef.current.filter(
        (t) => t.dirty && t.save !== 'conflict' && t.save !== 'revoked' && t.save !== 'auth',
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

  /** タブ追加。失敗時はエラーコードを返して UI に理由を表示させる。 */
  const addTab = useCallback(async (): Promise<
    { ok: true; tab_id: string } | { ok: false; code: string | null }
  > => {
    try {
      const { tab } = await api.createTab(token, '', pin);
      setTabs((prev) => [...prev, { ...tab, dirty: false, save: 'saved' as const }]);
      return { ok: true, tab_id: tab.tab_id };
    } catch (e) {
      return { ok: false, code: e instanceof ApiError ? e.code : null };
    }
  }, [token, pin]);

  /** タブ削除(最後の1枚はサーバ側で拒否される)。 */
  const removeTab = useCallback(
    async (tabId: string): Promise<boolean> => {
      try {
        await api.deleteTab(token, tabId, pin);
        clearBuffer(tabId);
        const timer = timersRef.current.get(tabId);
        if (timer) clearTimeout(timer);
        setTabs((prev) => prev.filter((t) => t.tab_id !== tabId));
        return true;
      } catch {
        return false;
      }
    },
    [token, pin],
  );

  return { tabs, edit, saveNow, flushAll, adoptServer, overwriteServer, addTab, removeTab };
}
