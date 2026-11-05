import { describe, expect, it } from 'vitest';
import { collapseMarkdown } from './collapseMarkdown';

describe('collapseMarkdown', () => {
    it('leaves short notes alone', () => {
        expect(collapseMarkdown('Added a filter.')).toBeNull();
    });

    it('keeps whole leading blocks of a long note', () => {
        const intro = 'I added two columns to the table.';
        const text = [intro, '- item '.repeat(80), 'Closing words.'].join(
            '\n\n',
        );
        expect(collapseMarkdown(text)).toBe(intro);
    });

    it('cuts a long single paragraph at a sentence', () => {
        const text = `${'Short sentence here. '.repeat(30)}`;
        const preview = collapseMarkdown(text);
        expect(preview?.endsWith('here.')).toBe(true);
        expect(preview!.length).toBeLessThanOrEqual(260);
    });

    it('adds leading sentences of the next paragraph after a short opener', () => {
        const next =
            'Each KPI now shows the change vs the prior period. The revenue chart is stacked by status. Returned orders are easy to spot.';
        const text = ['Both changes are in.', next, 'x '.repeat(300)].join(
            '\n\n',
        );
        expect(collapseMarkdown(text)).toBe(`Both changes are in.\n\n${next}`);
    });

    it('adds the first list item after a short opener', () => {
        const item =
            '- **KPI comparison:** each KPI now shows its change vs the prior period, for example "+12% vs prior 90 days".';
        const text = [
            'Both changes are in.',
            `${item} Increases are green, decreases are red, and the previous period ends the day before your range starts so both windows match.\n- **Chart:** ${'stacked '.repeat(60)}`,
        ].join('\n\n');
        expect(collapseMarkdown(text)).toBe(`Both changes are in.\n\n${item}`);
    });
});
