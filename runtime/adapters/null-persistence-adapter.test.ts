import { describe, expect, it } from "vitest";
import { NullPersistenceAdapter } from "./null-persistence-adapter";

describe("NullPersistenceAdapter", () => {
  it("save() resolves without storing anything", async () => {
    await expect(
      new NullPersistenceAdapter().save("collection", "id", { any: "value" }),
    ).resolves.toBeUndefined();
  });

  it("load() always resolves undefined", async () => {
    await expect(new NullPersistenceAdapter().load("collection", "id")).resolves.toBeUndefined();
  });

  it("delete() resolves without throwing", async () => {
    await expect(new NullPersistenceAdapter().delete("collection", "id")).resolves.toBeUndefined();
  });

  it("save() then load() does not return the saved value — it is a genuine no-op", async () => {
    const adapter = new NullPersistenceAdapter();
    await adapter.save("collection", "id", { value: 42 });
    const loaded = await adapter.load("collection", "id");
    expect(loaded).toBeUndefined();
  });
});
