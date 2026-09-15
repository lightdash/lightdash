import {
    ManagedAgentActionType,
    ManagedAgentTargetType,
} from '@lightdash/common';
import { renderHeartbeatSummary } from './heartbeatSummary';

const action = (
    actionType: ManagedAgentActionType,
    targetName = 'Only chart on dashboard',
    reversedAt: Date | null = null,
    targetType: ManagedAgentTargetType = ManagedAgentTargetType.CHART,
) => ({ actionType, targetType, targetName, reversedAt });

const render = (
    actions: ReturnType<typeof action>[] | null,
    interrupted = false,
) =>
    renderHeartbeatSummary({
        actions,
        interrupted,
        projectName: 'Jaffle Shop',
        seed: 'run-uuid',
    });

describe('heartbeat summaries from saved actions', () => {
    it('does not turn an insight about a chart into a flag', () => {
        const report = render([action(ManagedAgentActionType.INSIGHT)]);
        expect(report.text).toContain('- Stale flags: 0');
        expect(report.text).toContain('- Broken flags: 0');
        expect(report.text).toContain('- Insights for review: 1');
        expect(report.text).toContain('found nothing to fix');
        expect(report.text).not.toContain('Only chart on dashboard');
    });

    it('separates blocked attempts and reversed actions from active changes', () => {
        const report = render(
            [
                action(ManagedAgentActionType.BLOCKED, 'Protected chart'),
                action(
                    ManagedAgentActionType.FLAGGED_STALE,
                    'Dismissed',
                    new Date(),
                ),
                action(
                    ManagedAgentActionType.SOFT_DELETED,
                    'Restored',
                    new Date(),
                ),
            ],
            true,
        );
        expect(report.text).toContain('cut short');
        expect(report.text).toContain('1 thing I tried was refused');
        expect(report.text).toContain('- Stale flags: 0');
        expect(report.text).toContain('- Soft-deletions: 0');
        expect(report.text).toContain('- Refused attempts: 1');
        expect(report.text).toContain('- Reversed or dismissed actions: 2');
        expect(report.compactSummary).not.toContain('Soft-deletions');
    });

    it('tells the story of an active run and keeps every count in the ledger', () => {
        const report = render([
            ...Array.from({ length: 105 }, (_, i) =>
                action(ManagedAgentActionType.FLAGGED_BROKEN, `Chart ${i}`),
            ),
            action(ManagedAgentActionType.FIXED_BROKEN, 'Revenue'),
            action(ManagedAgentActionType.CREATED_CONTENT, 'Orders by week'),
            action(
                ManagedAgentActionType.FLAGGED_STALE,
                'Old dashboard',
                null,
                ManagedAgentTargetType.DASHBOARD,
            ),
        ]);
        expect(report.text).toContain('**Jaffle Shop: Autopilot update**');
        expect(report.text).toContain('I repaired 1 chart (`Revenue`)');
        expect(report.text).toContain('105 more are broken');
        expect(report.text).toContain(
            'I flagged 1 dashboard nobody has opened',
        );
        expect(report.text).toContain('so I built 1 chart (`Orders by week`)');
        expect(report.text).toContain('🧹 **The Sweep**');
        expect(report.text).toContain('🔧 **Fixed in the Field**');
        expect(report.text).toContain('💡 **Fresh Picks**');
        expect(report.text).toContain(
            '- Broken flags: 105 (`Chart 0`, `Chart 1`, `Chart 2`; 102 more targets)',
        );
        expect(report.compactSummary).toContain('Broken flags: 105');
        expect(report.text).not.toContain('Chart 104');
    });

    it('keeps a quiet run short and skips the named segments', () => {
        const report = render([
            action(ManagedAgentActionType.FIXED_BROKEN, 'Revenue'),
        ]);
        expect(report.text).toContain('clean bill of health');
        expect(report.text).not.toContain('The Sweep');
        expect(report.text).toContain('- Repairs: 1 (`Revenue`)');
    });

    it('keeps names on one line and duplicate names from inflating examples', () => {
        const report = render([
            action(
                ManagedAgentActionType.FIXED_BROKEN,
                'Sales & Marketing\n`chart`',
            ),
            action(
                ManagedAgentActionType.FIXED_BROKEN,
                'Sales & Marketing\n`chart`',
            ),
        ]);
        expect(report.text).toContain(
            '- Repairs: 2 (`Sales & Marketing  chart `)',
        );
    });

    it('writes standard markdown that both the page and Slack render', () => {
        const report = render([
            action(ManagedAgentActionType.FLAGGED_STALE, 'Old'),
        ]);
        expect(report.text).toContain('\n- Stale flags: 1 (`Old`)');
        expect(report.text).not.toMatch(/•|—|^\*[^*]/m);
    });

    it('signs off the same way every time the same run is rendered', () => {
        const first = render([]);
        const second = render([]);
        expect(first.text).toBe(second.text);
        expect(first.text).toContain('standing ovation');
    });

    it('distinguishes an unavailable ledger from no actions', () => {
        const unavailable = render(null);
        expect(unavailable.text).toContain(
            'saved action report is unavailable',
        );
        expect(unavailable.text).not.toContain('flags: 0');
        expect(unavailable.compactSummary).toBe(
            'Saved action report unavailable',
        );
        expect(render([]).compactSummary).toBe('No saved actions');
    });
});
