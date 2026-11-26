/** A name cut to fit a mark's label. */
export const clip = (text: string, max: number): string => {
    const clean = text.replace(/\s+/g, ' ').trim();
    return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

const LABEL_MAX = 120;
const TITLE_MIN = 12;

/** Ends a part's phrase with the tile it is on, within the label's length. */
export const onTile = (phrase: string, tileTitle: string): string =>
    `${phrase} on "${clip(tileTitle, Math.max(TITLE_MIN, LABEL_MAX - phrase.length - 6))}"`;

/** The tile a part belongs to. */
export type PartTile = { uuid: string; title: string };
