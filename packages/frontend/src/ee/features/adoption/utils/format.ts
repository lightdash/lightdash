// Whole numbers grouped by thousands, the same way in every adoption view
export const formatCount = (count: number): string =>
    count.toLocaleString('en-US');

// The words for one and for any other count, for example "query" and "queries"
export type Noun = { one: string; other: string };

export const PEOPLE: Noun = { one: 'person', other: 'people' };

export const formatQuantity = (count: number, noun: Noun): string =>
    `${formatCount(count)} ${count === 1 ? noun.one : noun.other}`;
