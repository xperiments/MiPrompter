// Minimal IndexedDB helper for storing the scripts collection.
// Keeps a single `kv` object store with string keys.

export async function openDB(name = "smui-db", version = 1) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) {
        db.createObjectStore("kv");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, cb: (store: IDBObjectStore) => IDBRequest) {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction("kv", mode);
    const store = tx.objectStore("kv");
    const req = cb(store);
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbGet<T = any>(key: string): Promise<T | null> {
  try {
    return await withStore<T | null>("readonly", (s) => s.get(key));
  } catch (err) {
    return null;
  }
}

export async function idbSet(key: string, value: any): Promise<void> {
  await withStore<void>("readwrite", (s) => s.put(value, key));
}

export async function idbDelete(key: string): Promise<void> {
  await withStore<void>("readwrite", (s) => s.delete(key));
}

export async function idbKeys(): Promise<string[]> {
  const db = await openDB();
  return new Promise<string[]>((resolve, reject) => {
    const tx = db.transaction("kv", "readonly");
    const store = tx.objectStore("kv");
    const req = store.getAllKeys();
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror = () => reject(req.error);
  });
}
