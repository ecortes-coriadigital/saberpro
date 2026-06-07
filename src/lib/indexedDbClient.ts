const DB_NAME = 'SaberProDB';
const DB_VERSION = 1;

export const indexedDbClient = {
  openDB: (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB is not supported on this platform.'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('preguntas')) {
          db.createObjectStore('preguntas', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('simulacros')) {
          db.createObjectStore('simulacros', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('resultados')) {
          db.createObjectStore('resultados', { keyPath: 'id' });
        }
      };

      request.onsuccess = (event: any) => {
        resolve(event.target.result);
      };

      request.onerror = (event: any) => {
        reject(event.target.error);
      };
    });
  },

  getAll: <T>(storeName: string): Promise<T[]> => {
    return indexedDbClient.openDB().then((db) => {
      return new Promise<T[]>((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = (event: any) => {
          resolve(event.target.result || []);
        };

        request.onerror = (event: any) => {
          reject(event.target.error);
        };
      });
    });
  },

  saveAll: <T>(storeName: string, items: T[]): Promise<void> => {
    return indexedDbClient.openDB().then((db) => {
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);

        const clearRequest = store.clear();
        clearRequest.onsuccess = () => {
          if (items.length === 0) {
            resolve();
            return;
          }
          let count = 0;
          let hasError = false;
          items.forEach((item) => {
            const addRequest = store.put(item);
            addRequest.onsuccess = () => {
              count++;
              if (count === items.length && !hasError) {
                resolve();
              }
            };
            addRequest.onerror = (event: any) => {
              hasError = true;
              reject(event.target.error);
            };
          });
        };

        clearRequest.onerror = (event: any) => {
          reject(event.target.error);
        };
      });
    });
  }
};
