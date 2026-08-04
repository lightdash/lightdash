import {
    DEFAULT_MANAGED_AGENT_POLICY,
    resolveManagedAgentPolicy,
} from './managedAgent';

describe('resolveManagedAgentPolicy', () => {
    it('returns defaults for empty overrides', () => {
        expect(resolveManagedAgentPolicy({})).toEqual(
            DEFAULT_MANAGED_AGENT_POLICY,
        );
        expect(DEFAULT_MANAGED_AGENT_POLICY).toEqual({
            stalenessChartDays: 90,
            stalenessDashboardDays: 90,
            previewProjectDays: 90,
            slowQueryThresholdMs: 2000,
            protectRecentDays: 30,
            escalationHours: 24,
            aggression: 'cleanup',
            audience: 'everyone',
            spaceScopeMode: 'all-except',
            verifiedContent: 'protected',
        });
    });

    it('returns defaults for null, undefined, and non-object input', () => {
        expect(resolveManagedAgentPolicy(null)).toEqual(
            DEFAULT_MANAGED_AGENT_POLICY,
        );
        expect(resolveManagedAgentPolicy(undefined)).toEqual(
            DEFAULT_MANAGED_AGENT_POLICY,
        );
        expect(resolveManagedAgentPolicy('not-an-object')).toEqual(
            DEFAULT_MANAGED_AGENT_POLICY,
        );
    });

    it('applies valid overrides on top of defaults', () => {
        expect(
            resolveManagedAgentPolicy({
                stalenessChartDays: 180,
                aggression: 'flag',
            }),
        ).toEqual({
            ...DEFAULT_MANAGED_AGENT_POLICY,
            stalenessChartDays: 180,
            aggression: 'flag',
        });
    });

    it('falls back per-field on invalid values without discarding valid ones', () => {
        expect(
            resolveManagedAgentPolicy({
                stalenessChartDays: -5,
                slowQueryThresholdMs: 'fast',
                aggression: 'nuke-everything',
                escalationHours: 48,
            }),
        ).toEqual({
            ...DEFAULT_MANAGED_AGENT_POLICY,
            escalationHours: 48,
        });
    });

    it('ignores unknown keys', () => {
        expect(resolveManagedAgentPolicy({ someFutureKey: true })).toEqual(
            DEFAULT_MANAGED_AGENT_POLICY,
        );
    });
});
