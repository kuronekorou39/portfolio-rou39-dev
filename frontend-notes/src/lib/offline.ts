import type { MemoData } from './api';

/**
 * メモのオフライン保存(IndexedDB)。
 *
 * メモ内容は SW の HTTP キャッシュに絶対に載せない(APIのURLが全利用者で同一のため
 * 混線する)。ここでトークン別のキーで保存し、オフライン時のフォールバックに使う。
 * 端末に生トークンと本文が残ることは PWA 化に伴う受容済みトレードオフ
 * (失効済みトークンで開いた際はスナップショットを削除して掃除する)。
 * このファイルは lib/auth を import しない(メモ画面チャンクの隔離)。
 */

const DB_NAME = 'notes-offline';
const STORE = 'memos';

export interface MemoSnapshot {
  token: string;
  data: MemoData;
  savedAt: number; // epoch ms
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'token' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export function saveSnapshot(token: string, data: MemoData): Promise<unknown> {
  const snap: MemoSnapshot = { token, data, savedAt: Date.now() };
  return tx('readwrite', (s) => s.put(snap));
}

export function loadSnapshot(token: string): Promise<MemoSnapshot | null> {
  return tx<MemoSnapshot | undefined>('readonly', (s) => s.get(token)).then((v) => v ?? null);
}

export function deleteSnapshot(token: string): Promise<unknown> {
  return tx('readwrite', (s) => s.delete(token));
}
