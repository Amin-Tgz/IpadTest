const DB_NAME = "pencil-ai";
const DB_VERSION = 1;
const STORE = "sessions";
const KEY_MANIFEST = "character_manifest";
const KEY_STROKES = "strokes";
const KEY_QUEST = "quest_state";
export class SessionStorage {
    api;
    constructor(api) {
        this.api = api;
    }
    open() {
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
    async withStore(mode, fn) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, mode);
            const request = fn(tx.objectStore(STORE));
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            tx.oncomplete = () => db.close();
            tx.onerror = () => reject(tx.error);
        });
    }
    put(store, value, key) {
        return store.put(value, key);
    }
    saveManifest(manifest) {
        return this.withStore("readwrite", (store) => this.put(store, manifest, KEY_MANIFEST));
    }
    loadManifest() {
        return this.withStore("readonly", (store) => store.get(KEY_MANIFEST)).then((value) => value ?? null);
    }
    saveStrokes(strokes) {
        return this.withStore("readwrite", (store) => this.put(store, strokes, KEY_STROKES));
    }
    loadStrokes() {
        return this.withStore("readonly", (store) => store.get(KEY_STROKES)).then((value) => value ?? null);
    }
    saveQuest(state) {
        return this.withStore("readwrite", (store) => this.put(store, state, KEY_QUEST));
    }
    loadQuest() {
        return this.withStore("readonly", (store) => store.get(KEY_QUEST)).then((value) => value ?? null);
    }
    clearSession() {
        return this.withStore("readwrite", (store) => store.clear());
    }
}
export function createSessionStorage() {
    if (typeof indexedDB === "undefined")
        return null;
    return new SessionStorage({ indexedDB, IDBKeyRange });
}
