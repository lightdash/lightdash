import { describe, expect, it } from 'vitest';
import {
    splitRunSummary,
    toPlainPreview,
    toRunSummaryMarkdown,
} from './runSummaryMarkdown';

describe('toRunSummaryMarkdown', () => {
    it('turns Slack bold from hosted runs into markdown bold', () => {
        expect(
            toRunSummaryMarkdown(
                '*Analytics Project: agent update*\n\n🧹 *The Sweep*\n5 charts flagged.',
            ),
        ).toBe(
            '**Analytics Project: agent update**\n\n🧹 **The Sweep**\n5 charts flagged.',
        );
    });

    it('leaves Slack italics and plain asterisks alone', () => {
        const summary =
            '_Quiet week_. Ran SELECT * FROM orders and 2 * 3 = 6, see `a*b*c`.';
        expect(toRunSummaryMarkdown(summary)).toBe(summary);
    });

    it('does not touch summaries that are already markdown', () => {
        const summary =
            '**Jaffle shop: Autopilot update**\n\n*emphasis stays* as written.';
        expect(toRunSummaryMarkdown(summary)).toBe(summary);
    });
});

describe('splitRunSummary', () => {
    const report = [
        '**Analytics: Autopilot update**',
        'I retired 5 charts, `Avg. Hours to Resolution` among them.',
        '**By the numbers**\n\n- Soft-deletions: 5\n- Ran on: anthropic',
        'I will be back.',
    ].join('\n\n');

    it('drops the title line and leads with the first paragraph', () => {
        expect(splitRunSummary(report)).toEqual({
            lead: 'I retired 5 charts, “Avg. Hours to Resolution” among them.',
            full: [
                'I retired 5 charts, “Avg. Hours to Resolution” among them.',
                '**By the numbers**\n\n- Soft-deletions: 5\n- Ran on: anthropic',
                'I will be back.',
            ].join('\n\n'),
        });
    });

    it('quotes named content but keeps identifiers as code', () => {
        expect(
            splitRunSummary(
                'Fixed `Weekly revenue` after `has_sweep_closure` moved.',
            ).lead,
        ).toBe('Fixed “Weekly revenue” after `has_sweep_closure` moved.');
    });

    it('handles Slack-style titles and single-paragraph reports', () => {
        expect(splitRunSummary('*Quiet week*\n\nNothing to do.')).toEqual({
            lead: 'Nothing to do.',
            full: 'Nothing to do.',
        });
    });
});

describe('toPlainPreview', () => {
    it('flattens markdown markup into one line of prose', () => {
        expect(
            toPlainPreview(
                '**pylon_issues: first regression.** Cost fell.\n\n- `total_issues` at 2,908\n- *volatile* trend\n\n```yaml\nname: x\n```',
            ),
        ).toBe(
            'pylon_issues: first regression. Cost fell. total_issues at 2,908 volatile trend',
        );
    });

    it('leaves arithmetic and snake_case alone', () => {
        expect(toPlainPreview('2 * 3 = 6 and has_sweep_closure stays')).toBe(
            '2 * 3 = 6 and has_sweep_closure stays',
        );
    });
});
