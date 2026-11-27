import { DashboardTileTypes } from '@lightdash/common';
import {
    NOTE_CHARS_PER_LINE,
    NOTE_MAX_ROWS,
    noteBody,
    noteLines,
    noteRows,
    noteTextHeight,
    noteTileHeight,
    titledNote,
} from './noteLayout';
import { analyticsContentAsCode } from './sampleContent';

const line = (characters: number) => 'a'.repeat(characters);
const lines = (count: number) =>
    Array.from({ length: count }, () => line(NOTE_CHARS_PER_LINE)).join(' ');

const notes = analyticsContentAsCode.flatMap(({ dashboard }) =>
    dashboard.tiles
        .filter((tile) => tile.type === DashboardTileTypes.MARKDOWN)
        .map((tile) => ({
            dashboard: dashboard.slug,
            tab: tile.tabSlug,
            rows: tile.h,
            content: (tile.properties as { content: string }).content,
        })),
);
// AI token usage ends its tabs with reference notes under the tiles. Their height is set by hand and
// their place names the tile, so they are only checked for clipping
const captions = notes.filter(
    ({ dashboard }) => dashboard !== 'lightdash-analytics-ai-tokens',
);
const sentencesOf = (text: string) =>
    text.split(/[.?!](?:\s+|$)/).filter((sentence) => sentence.trim()).length;

describe('note height', () => {
    it('gives one row to a caption of one or two lines', () => {
        expect(noteRows('Tokens measure usage, not cost.')).toBe(1);
        expect(noteRows(lines(2))).toBe(1);
    });

    it('gives two rows to a third line, and to any note with a heading', () => {
        expect(noteRows(lines(3))).toBe(2);
        expect(noteRows('### Caching\n\nOne short line.')).toBe(2);
        expect(noteRows(`### Caching\n\n${lines(3)}`)).toBe(2);
    });

    it('never gives more than two rows, so longer text would be cut off', () => {
        const tooLong = `### Caching\n\n${lines(4)}`;
        expect(noteRows(tooLong)).toBe(NOTE_MAX_ROWS);
        expect(noteTextHeight(tooLong)).toBeGreaterThan(
            noteTileHeight(NOTE_MAX_ROWS),
        );
    });

    it('gives one row to a bold title with one line under it', () => {
        const note = titledNote('Caching', 'One short line.');
        expect(note).toBe('**Caching**  \nOne short line.');
        expect(noteLines(note)).toBe(2);
        expect(noteRows(note)).toBe(1);
        expect(noteBody(note)).toBe('One short line.');
        // A longer description keeps the same bold title, never a large heading, and takes two rows
        const long = titledNote('Caching', lines(2));
        expect(long).toBe(`**Caching**  \n${lines(2)}`);
        expect(noteRows(long)).toBe(2);
        // A title with nothing under it is still the bold line
        expect(titledNote('Caching', '')).toBe('**Caching**');
        // A single newline without the two spaces is only a space
        expect(noteLines('one\ntwo')).toBe(1);
    });

    it('wraps on whole words and ignores bold markers', () => {
        expect(noteLines(`${line(100)} ${line(100)}`)).toBe(2);
        expect(noteLines(`**${line(NOTE_CHARS_PER_LINE)}**`)).toBe(1);
    });
});

describe('notes on the built-in dashboards', () => {
    it('are found on the dashboards that have sections', () => {
        expect(notes.length).toBeGreaterThan(50);
    });

    it.each(notes)(
        'shows all of its text: $dashboard > $tab > $content',
        ({ rows, content }) => {
            expect(noteTextHeight(content)).toBeLessThanOrEqual(
                noteTileHeight(rows),
            );
        },
    );

    it.each(captions)(
        'is as tall as its text and no taller: $dashboard > $tab > $content',
        ({ rows, content }) => {
            expect(rows).toBe(noteRows(content));
            expect(rows).toBeLessThanOrEqual(NOTE_MAX_ROWS);
        },
    );

    it.each(captions)(
        'says what is needed in two sentences and two lines: $dashboard > $tab > $content',
        ({ content }) => {
            expect(sentencesOf(noteBody(content))).toBeLessThanOrEqual(2);
            expect(noteLines(content)).toBeLessThanOrEqual(2);
        },
    );

    // One form on every tab: the section's title in bold, then one line under it, in one grid row.
    // No large heading, and no text with no title above it.
    it.each(captions)(
        'is a bold title with one line under it: $dashboard > $tab > $content',
        ({ rows, content }) => {
            expect(content).toMatch(/^\*\*[^*\n]+\*\* {2}\n[^\n#]+$/);
            expect(rows).toBe(1);
        },
    );

    it('checks that form on every dashboard but AI token usage', () => {
        expect(captions.length).toBeGreaterThan(40);
        expect(new Set(captions.map(({ dashboard }) => dashboard))).toEqual(
            new Set([
                'lightdash-analytics-overview',
                'lightdash-analytics-query-activity',
                'lightdash-analytics-content',
                'lightdash-analytics-apps',
                'lightdash-analytics-tools',
                'lightdash-analytics-adoption',
                'lightdash-analytics-embed',
            ]),
        );
    });
});
