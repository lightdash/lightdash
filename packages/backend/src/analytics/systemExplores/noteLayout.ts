// How tall a text tile must be to show all of its text, so the layout gives it that height and no more.
// The sizes are those of the dashboard grid and of the markdown tile drawn without a frame
// (packages/frontend: DEFAULT_ROW_HEIGHT and GRID_MARGIN in features/dashboardTabs/gridUtils.ts,
// the 14px text of DashboardMarkdownTile.module.css at a line height of 1.5).

// Characters on one line of a full-width tile at the narrowest width the Settings page shows a
// dashboard at, about 1150px
export const NOTE_CHARS_PER_LINE = 150;
// Text above tiles is a caption, not a page: it never takes more than two grid rows
export const NOTE_MAX_ROWS = 2;

const ROW_PX = 55;
const ROW_GAP_PX = 10;
const LINE_PX = 21;
// A ### heading with the space under it
const HEADING_PX = 38;
const PARAGRAPH_GAP_PX = 16;

const linesOf = (text: string): number => {
    let lines = 1;
    let used = 0;
    for (const word of text.split(/\s+/).filter(Boolean)) {
        const needed = used === 0 ? word.length : used + 1 + word.length;
        if (needed > NOTE_CHARS_PER_LINE && used > 0) {
            lines += 1;
            used = word.length;
        } else used = needed;
    }
    return lines;
};

const blocksOf = (content: string) =>
    content
        .split(/\n+/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block) => ({
            isHeading: block.startsWith('#'),
            // Markers for bold text take no room
            text: block.replace(/^#+\s*/, '').replaceAll('**', ''),
        }));

// The text of a note without its heading
export const noteBody = (content: string): string =>
    blocksOf(content)
        .filter(({ isHeading }) => !isHeading)
        .map(({ text }) => text)
        .join(' ');

export const noteLines = (content: string): number =>
    blocksOf(content)
        .filter(({ isHeading }) => !isHeading)
        .reduce((total, { text }) => total + linesOf(text), 0);

export const noteTextHeight = (content: string): number => {
    const blocks = blocksOf(content);
    const paragraphs = blocks.filter(({ isHeading }) => !isHeading);
    return (
        blocks.filter(({ isHeading }) => isHeading).length * HEADING_PX +
        paragraphs.reduce((total, { text }) => total + linesOf(text), 0) *
            LINE_PX +
        Math.max(paragraphs.length - 1, 0) * PARAGRAPH_GAP_PX
    );
};

export const noteTileHeight = (rows: number): number =>
    rows * ROW_PX + (rows - 1) * ROW_GAP_PX;

// The fewest grid rows that show the whole note. One row holds two lines of text, so a caption of one
// or two lines takes one row. A heading with up to three lines under it takes two.
export const noteRows = (content: string): number => {
    const needed = noteTextHeight(content);
    let rows = 1;
    while (rows < NOTE_MAX_ROWS && noteTileHeight(rows) < needed) rows += 1;
    return rows;
};
