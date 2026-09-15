import { describe, expect, it } from 'vitest';
import { toRunSummaryMarkdown } from './runSummaryMarkdown';

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
