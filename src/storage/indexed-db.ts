// Retain the prototype database name so the Line Pal rebrand does not discard
// existing local stories or their conversation history.
const DB_NAME = "pencil-ai";
const DB_VERSION = 1;
const STORE = "sessions";
const KEY_MANIFEST = "character_manifest";
const KEY_STROKES = "strokes";
const KEY_QUEST = "quest_state";

interface IndexedDbApi {
  indexedDB: IDBFactory;
  IDBKeyRange: typeof IDBKeyRange;
}

export class SessionStorage {
  constructor(private readonly api: IndexedDbApi) {}

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = this.api.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async withStore<T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = fn(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => reject(tx.error);
    });
  }

  private put(store: IDBObjectStore, value: unknown, key: IDBValidKey): IDBRequest<undefined> {
    return store.put(value, key) as unknown as IDBRequest<undefined>;
  }

  saveManifest(manifest: unknown): Promise<void> {
    return this.withStore("readwrite", (store) => this.put(store, manifest, KEY_MANIFEST));
  }

  loadManifest<T>(): Promise<T | null> {
    return this.withStore("readonly", (store) => store.get(KEY_MANIFEST) as IDBRequest<T | null>).then(
      (value) => value ?? null,
    );
  }

  saveStrokes(strokes: unknown): Promise<void> {
    return this.withStore("readwrite", (store) => this.put(store, strokes, KEY_STROKES));
  }

  loadStrokes<T>(): Promise<T | null> {
    return this.withStore("readonly", (store) => store.get(KEY_STROKES) as IDBRequest<T | null>).then(
      (value) => value ?? null,
    );
  }

  saveQuest(state: unknown): Promise<void> {
    return this.withStore("readwrite", (store) => this.put(store, state, KEY_QUEST));
  }

  loadQuest<T>(): Promise<T | null> {
    return this.withStore("readonly", (store) => store.get(KEY_QUEST) as IDBRequest<T | null>).then(
      (value) => value ?? null,
    );
  }

  clearSession(): Promise<void> {
    return this.withStore("readwrite", (store) => store.clear());
  }
}

export function createSessionStorage(): SessionStorage | null {
  if (typeof indexedDB === "undefined") return null;
  return new SessionStorage({ indexedDB, IDBKeyRange });
}
