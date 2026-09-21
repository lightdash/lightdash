/** `3 fields`, `1 metric` — the plural rule Chart Studio's summaries share. */
export const countLabel = (count: number, noun: string) =>
    `${count} ${noun}${count === 1 ? '' : 's'}`;
