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

// Ends a line inside a paragraph without the gap a new paragraph has (two spaces before the newline)
export const NOTE_LINE_BREAK = '  \n';

type Block = { isHeading: boolean; lines: string[] };

// Markers for bold text take no room
const plain = (text: string) => text.trim().replaceAll('**', '');

// Headings and paragraphs, as markdown reads them: a blank line starts a new paragraph, a line break
// starts a new line in the same paragraph, and any other newline is only a space.
const blocksOf = (content: string): Block[] => {
    const blocks: Block[] = [];
    for (const paragraph of content.split(/\n{2,}/)) {
        let current: Block | null = null;
        let brokeLine = false;
        for (const raw of paragraph.split('\n')) {
            const text = plain(raw.replace(/^#+\s*/, ''));
            if (raw.trim().startsWith('#')) {
                blocks.push({ isHeading: true, lines: [text] });
                current = null;
            } else if (text) {
                if (!current) {
                    current = { isHeading: false, lines: [text] };
                    blocks.push(current);
                } else if (brokeLine) current.lines.push(text);
                else current.lines[current.lines.length - 1] += ` ${text}`;
            }
            brokeLine = raw.endsWith('  ');
        }
    }
    return blocks;
};

const paragraphsOf = (content: string) =>
    blocksOf(content).filter(({ isHeading }) => !isHeading);
const linesIn = ({ lines }: Block) =>
    lines.reduce((total, text) => total + linesOf(text), 0);

// The text of a note without its heading or bold title line
export const noteBody = (content: string): string =>
    paragraphsOf(content.replace(/^\*\*[^*\n]+\*\* {2}\n/, ''))
        .flatMap(({ lines }) => lines)
        .join(' ');

export const noteLines = (content: string): number =>
    paragraphsOf(content).reduce((total, block) => total + linesIn(block), 0);

export const noteTextHeight = (content: string): number => {
    const paragraphs = paragraphsOf(content);
    return (
        (blocksOf(content).length - paragraphs.length) * HEADING_PX +
        paragraphs.reduce((total, block) => total + linesIn(block), 0) *
            LINE_PX +
        Math.max(paragraphs.length - 1, 0) * PARAGRAPH_GAP_PX
    );
};

// The text above a section with a title. A heading with one line under it needs two grid rows and
// leaves most of the second empty, so a one-line description takes a bold title on the line above it
// instead: two lines, one row.
export const titledNote = (title: string, description: string): string =>
    description && noteLines(description) === 1
        ? `**${title}**${NOTE_LINE_BREAK}${description}`
        : `### ${title}\n\n${description}`;

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
