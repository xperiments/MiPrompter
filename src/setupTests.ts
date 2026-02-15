import '@testing-library/jest-dom';

// Minimal IndexedDB stub for tests (jsdom doesn't provide indexedDB)
if (typeof (globalThis as any).indexedDB === 'undefined') {
  (globalThis as any).indexedDB = {
    open: (name: string, version?: number) => {
      const req: any = {};
      // call onsuccess asynchronously after test code assigns handlers
      setTimeout(() => {
        const db: any = {
          objectStoreNames: {
            contains: () => false,
          },
          createObjectStore: () => {},
          transaction: (_name: string, _mode: IDBTransactionMode) => ({
            objectStore: (_n: string) => ({
              get: (_k: string) => ({ onsuccess: () => {}, onerror: () => {}, result: null }),
              put: (_v: any, _k: string) => ({ onsuccess: () => {}, onerror: () => {}, result: null }),
              delete: (_k: string) => ({ onsuccess: () => {}, onerror: () => {}, result: null }),
              getAllKeys: () => ({ onsuccess: () => {}, onerror: () => {}, result: [] }),
            }),
            oncomplete: () => {},
            onerror: () => {},
            error: null,
          }),
          close: () => {},
        };
        req.result = db;
        if (typeof req.onsuccess === 'function') req.onsuccess();
      }, 0);
      return req;
    },
  };
}
