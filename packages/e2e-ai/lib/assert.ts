import { expect } from 'playwright/test';

/** Asserts exactly one item and returns it. */
export const single = <T>(items: readonly T[], what: string): T => {
    expect(items, what).toHaveLength(1);
    const [item] = items;
    if (item === undefined) throw new Error(`Missing ${what}`);
    return item;
};
