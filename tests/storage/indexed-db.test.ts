import { describe, expect, it, beforeAll, afterAll } from "vitest";
import "fake-indexeddb/auto";
import { SessionStorage } from "../../src/storage/indexed-db.js";

describe("SessionStorage", () => {
  let storage: SessionStorage;

  beforeAll(() => {
    storage = new SessionStorage({ indexedDB, IDBKeyRange });
  });

  afterAll(async () => {
    await storage.clearSession();
  });

  it("round-trips a manifest", async () => {
    const manifest = { version: "1.0", joints: [{ id: "root", x: 1, y: 2 }] };
    await storage.saveManifest(manifest);
    const loaded = await storage.loadManifest<typeof manifest>();
    expect(loaded).toEqual(manifest);
  });

  it("returns null when nothing is saved", async () => {
    await storage.clearSession();
    expect(await storage.loadManifest()).toBeNull();
    expect(await storage.loadStrokes()).toBeNull();
  });

  it("round-trips quest state", async () => {
    const quest = { state: "WALK_TO_POND", step: 3 };
    await storage.saveQuest(quest);
    expect(await storage.loadQuest()).toEqual(quest);
  });
});
