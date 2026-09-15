import { ManagedAgentActionType } from '@lightdash/common';
import { renderHeartbeatSummary } from './heartbeatSummary';

const action = (
    actionType: ManagedAgentActionType,
    targetName = 'Only chart on dashboard',
    reversedAt: Date | null = null,
) => ({ actionType, targetName, reversedAt });

describe('heartbeat summaries from saved actions', () => {
    it('does not turn an insight about a chart into a flag', () => {
        const report = renderHeartbeatSummary({
            actions: [action(ManagedAgentActionType.INSIGHT)],
            interrupted: false,
        });
        expect(report.text).toContain('Stale flags: 0');
        expect(report.text).toContain('Broken flags: 0');
        expect(report.text).toContain('Insights for review: 1');
        expect(report.text).not.toContain('Only chart on dashboard');
    });
    it('separates blocked attempts and reversed actions from active changes', () => {
        const report = renderHeartbeatSummary({
            actions: [
                action(ManagedAgentActionType.BLOCKED),
                action(
                    ManagedAgentActionType.SOFT_DELETED,
                    'Restored chart',
                    new Date(),
                ),
                action(
                    ManagedAgentActionType.FLAGGED_STALE,
                    'Dismissed chart',
                    new Date(),
                ),
            ],
            interrupted: true,
        });
        expect(report.text).toContain('Run interrupted');
        expect(report.text).toContain('Stale flags: 0');
        expect(report.text).toContain('Soft-deletions: 0');
        expect(report.text).toContain('Refused attempts: 1');
        expect(report.text).toContain('Reversed or dismissed actions: 2');
        expect(report.compactSummary).not.toContain('Soft-deletions');
    });
    it('counts the whole group while limiting examples to actual names', () => {
        const report = renderHeartbeatSummary({
            actions: Array.from({ length: 105 }, (_, i) =>
                action(ManagedAgentActionType.FLAGGED_BROKEN, `Chart ${i}`),
            ),
            interrupted: false,
        });
        expect(report.text).toContain(
            'Broken flags: 105 (`Chart 0`, `Chart 1`, `Chart 2`; 102 more targets)',
        );
        expect(report.compactSummary).toContain('Broken flags: 105');
        expect(report.text).not.toContain('Chart 104');
    });
    it('keeps names on one line and duplicate names from inflating examples', () => {
        const report = renderHeartbeatSummary({
            actions: [
                action(
                    ManagedAgentActionType.FIXED_BROKEN,
                    'Sales & Marketing\n`chart`',
                ),
                action(
                    ManagedAgentActionType.FIXED_BROKEN,
                    'Sales & Marketing\n`chart`',
                ),
            ],
            interrupted: false,
        });
        expect(report.text).toContain(
            'Repairs: 2 (`Sales & Marketing  chart `)',
        );
    });
    it('writes standard markdown that both the page and Slack render', () => {
        const report = renderHeartbeatSummary({
            actions: [action(ManagedAgentActionType.FLAGGED_STALE, 'Old')],
            interrupted: false,
        });
        expect(report.text).toContain('**Autopilot activity**');
        expect(report.text).toContain('\n- Stale flags: 1 (`Old`)');
        expect(report.text).not.toMatch(/•|—|^\*[^*]/m);
    });
    it('distinguishes an unavailable ledger from no actions', () => {
        expect(
            renderHeartbeatSummary({ actions: null, interrupted: true }).text,
        ).toContain('unavailable');
        expect(
            renderHeartbeatSummary({ actions: null, interrupted: true }).text,
        ).not.toContain('flags: 0');
        expect(
            renderHeartbeatSummary({ actions: [], interrupted: false })
                .compactSummary,
        ).toBe('No saved actions');
    });
});
