/**
 * In-memory storage for sensitive data like JWT tokens
 * This provides better security than localStorage as data is not persisted
 */
const inMemoryStore = new Map<string, unknown>();

export const getFromInMemoryStorage = <T>(key: string): T | undefined => {
    return inMemoryStore.get(key) as T;
};

export const setToInMemoryStorage = <T>(key: string, value: T): void => {
    inMemoryStore.set(key, value);
};

export const clearInMemoryStorage = (): void => {
    inMemoryStore.clear();
};
