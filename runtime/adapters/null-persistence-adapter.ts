import type { PersistencePort } from "../ports/types";

/** No-op `PersistencePort` — every method resolves immediately without storing anything. */
export class NullPersistenceAdapter implements PersistencePort {
  async save<T>(collection: string, id: string, value: T): Promise<void> {
    void collection;
    void id;
    void value;
    return Promise.resolve();
  }

  async load<T>(collection: string, id: string): Promise<T | undefined> {
    void collection;
    void id;
    return Promise.resolve(undefined);
  }

  async list<T>(collection: string): Promise<readonly T[]> {
    void collection;
    return Promise.resolve([]);
  }

  async delete(collection: string, id: string): Promise<void> {
    void collection;
    void id;
    return Promise.resolve();
  }
}
