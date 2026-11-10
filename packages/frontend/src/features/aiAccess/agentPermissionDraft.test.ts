import {
    AgentCapability,
    type AgentCapabilityPolicyOverview,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    policyToDraft,
    getAgentPermissionChoice,
    chooseAgentPermission,
    toggleAgentCapability,
    draftToPolicyRequest,
    getAgentPermissionChanges,
    countAgentPermissionChanges,
    sameAgentPermissionDraft,
} from './agentPermissionDraft';

const all = Object.values(AgentCapability);
const read = [
    AgentCapability.ReadDiscover,
    AgentCapability.Query,
    AgentCapability.Export,
    AgentCapability.RawSql,
];
const policy = (
    overrides: Partial<AgentCapabilityPolicyOverview> = {},
): AgentCapabilityPolicyOverview => ({
    mode: 'legacy',
    version: 4,
    allowedCapabilities: null,
    allowedGroupUuids: null,
    groupsAvailable: true,
    ...overrides,
});
const count = (
    a: ReturnType<typeof policyToDraft>,
    b: ReturnType<typeof policyToDraft>,
) => countAgentPermissionChanges(getAgentPermissionChanges(a, b), a, b);

describe('agent permission draft', () => {
    it('compares drafts by content, not by order or version', () => {
        const saved = policyToDraft(
            policy({
                mode: 'managed',
                allowedCapabilities: read,
                allowedGroupUuids: ['a', 'b'],
            }),
        );
        const reordered = policyToDraft(
            policy({
                mode: 'managed',
                version: 9,
                allowedCapabilities: [...read].reverse(),
                allowedGroupUuids: ['b', 'a'],
            }),
        );
        expect(sameAgentPermissionDraft(saved, reordered)).toBe(true);
        expect(
            sameAgentPermissionDraft(saved, {
                ...reordered,
                allowedGroupUuids: ['a'],
            }),
        ).toBe(false);
        expect(
            sameAgentPermissionDraft(saved, {
                ...reordered,
                allowedGroupUuids: null,
            }),
        ).toBe(false);
        expect(
            sameAgentPermissionDraft(saved, {
                ...reordered,
                allowedCapabilities: [AgentCapability.Query],
            }),
        ).toBe(false);
        expect(
            sameAgentPermissionDraft(saved, { ...reordered, mode: 'legacy' }),
        ).toBe(false);
    });
    it('starts Custom with every capability, counting the mode once', () => {
        const baseline = policyToDraft(policy());
        const draft = chooseAgentPermission(baseline, 'custom', baseline);
        expect(draft.allowedCapabilities).toEqual(all);
        expect(draft).not.toHaveProperty('systemRoleMatrix');
        expect(count(baseline, draft)).toBe(1);
    });
    it('recognises Read and query only with the exact list', () => {
        const draft = chooseAgentPermission(
            policyToDraft(policy()),
            'read',
            policyToDraft(policy()),
        );
        expect(draft.allowedCapabilities).toEqual(read);
        expect(getAgentPermissionChoice(draft)).toBe('read');
        expect(
            getAgentPermissionChoice({
                ...draft,
                allowedCapabilities: [...read].reverse(),
            }),
        ).toBe('read');
        expect(
            getAgentPermissionChoice({
                ...draft,
                allowedCapabilities: [AgentCapability.Query],
            }),
        ).toBe('custom');
        expect(
            getAgentPermissionChoice({ ...draft, allowedCapabilities: all }),
        ).toBe('custom');
        expect(getAgentPermissionChoice({ ...draft, mode: 'legacy' })).toBe(
            'person',
        );
    });
    it('starts Custom fully enabled after the Read choice', () => {
        const draft = chooseAgentPermission(
            policyToDraft(policy()),
            'read',
            policyToDraft(policy()),
        );
        const custom = chooseAgentPermission(
            draft,
            'custom',
            policyToDraft(policy()),
        );
        expect(custom.allowedCapabilities).toEqual(all);
    });
    it('counts named choices once and group changes separately', () => {
        const base = policyToDraft(policy());
        const readDraft = chooseAgentPermission(base, 'read', base);
        expect(count(base, readDraft)).toBe(1);
        expect(count(base, { ...readDraft, allowedGroupUuids: ['a'] })).toBe(2);
        const custom = chooseAgentPermission(base, 'custom', base);
        expect(
            count(custom, chooseAgentPermission(custom, 'person', custom)),
        ).toBe(1);
        expect(
            count(
                base,
                toggleAgentCapability(
                    toggleAgentCapability(custom, AgentCapability.Delete),
                    AgentCapability.Publish,
                ),
            ),
        ).toBe(3);
        expect(
            count(
                readDraft,
                chooseAgentPermission(readDraft, 'custom', readDraft),
            ),
        ).toBe(7);
    });
    it('restores saved Custom capabilities', () => {
        const nine = all.filter(
            (cap) =>
                cap !== AgentCapability.Delete &&
                cap !== AgentCapability.Publish,
        );
        const base = policyToDraft(
            policy({ mode: 'managed', allowedCapabilities: nine }),
        );
        const readDraft = chooseAgentPermission(base, 'read', base);
        const restored = chooseAgentPermission(readDraft, 'custom', base);
        expect(restored).toEqual(base);
        expect(count(base, restored)).toBe(0);
        expect(chooseAgentPermission(base, 'custom', base)).toBe(base);
    });
    it('sends only the groups on a legacy group-only save', () => {
        const baseline = policyToDraft(policy());
        expect(
            draftToPolicyRequest(baseline, {
                ...baseline,
                allowedGroupUuids: ['a'],
            }),
        ).toEqual({
            version: 4,
            mode: 'legacy',
            allowedCapabilities: null,
            allowedGroupUuids: ['a'],
        });
    });
    it('starts a managed policy without a saved list clean, then writes the visible list on a group-only save', () => {
        const baseline = policyToDraft(policy({ mode: 'managed' }));
        expect(getAgentPermissionChoice(baseline)).toBe('custom');
        expect(baseline.allowedCapabilities).toEqual(all);
        expect(count(baseline, baseline)).toBe(0);
        const draft = { ...baseline, allowedGroupUuids: ['a'] };
        const changes = getAgentPermissionChanges(baseline, draft);
        expect(changes.stops).toEqual([]);
        expect(changes.allows).toEqual([]);
        expect(count(baseline, draft)).toBe(1);
        expect(draftToPolicyRequest(baseline, draft)).toEqual({
            version: 4,
            mode: 'managed',
            allowedCapabilities: all,
            allowedGroupUuids: ['a'],
        });
    });
    it('counts each switched-off capability once and restores it when switched back on', () => {
        const saved = policyToDraft(policy());
        const base = chooseAgentPermission(saved, 'custom', saved);
        const draft = toggleAgentCapability(
            toggleAgentCapability(base, AgentCapability.Delete),
            AgentCapability.Publish,
        );
        expect(draft.allowedCapabilities).toEqual(
            all.filter(
                (c) =>
                    c !== AgentCapability.Delete &&
                    c !== AgentCapability.Publish,
            ),
        );
        expect(count(base, draft)).toBe(2);
        expect(getAgentPermissionChanges(base, draft).stops).toEqual(
            expect.arrayContaining([
                AgentCapability.Delete,
                AgentCapability.Publish,
            ]),
        );
        expect(
            toggleAgentCapability(draft, AgentCapability.Delete)
                .allowedCapabilities,
        ).toEqual(all.filter((c) => c !== AgentCapability.Publish));
        const restored = toggleAgentCapability(
            toggleAgentCapability(draft, AgentCapability.Delete),
            AgentCapability.Publish,
        );
        expect(restored.allowedCapabilities).toEqual(all);
        expect(count(base, restored)).toBe(0);
    });
    it('ignores group order and version', () => {
        const base = policyToDraft(policy({ allowedGroupUuids: ['a', 'b'] }));
        expect(
            count(base, {
                ...base,
                version: 8,
                allowedGroupUuids: ['b', 'a'],
            }),
        ).toBe(0);
    });
    it.each([null, [], ['hidden']])(
        'omits unchanged groups %j and sends explicit null when cleared',
        (groups) => {
            const base = policyToDraft(policy({ allowedGroupUuids: groups }));
            const draft = chooseAgentPermission(base, 'custom', base);
            expect(draftToPolicyRequest(base, draft)).not.toHaveProperty(
                'allowedGroupUuids',
            );
            if (groups !== null)
                expect(
                    draftToPolicyRequest(base, {
                        ...draft,
                        allowedGroupUuids: null,
                    }),
                ).toHaveProperty('allowedGroupUuids', null);
        },
    );
    it('sends only known fields and preserves groups when removing limits', () => {
        const base = policyToDraft(
            policy({
                mode: 'managed',
                allowedCapabilities: read,
                allowedGroupUuids: ['a'],
            }),
        );
        const draft = chooseAgentPermission(base, 'person', base);
        expect(
            draftToPolicyRequest(base, {
                ...draft,
                mcpAgentsEnabled: false,
            } as typeof draft),
        ).toEqual({
            version: 4,
            mode: 'legacy',
            allowedCapabilities: null,
        });
        expect(getAgentPermissionChanges(base, draft).mode).toBe('legacy');
        expect(count(base, draft)).toBe(1);
    });
    it('marks all-off and restoration without invented activity', () => {
        const base = chooseAgentPermission(
            policyToDraft(policy()),
            'custom',
            policyToDraft(policy()),
        );
        const draft = { ...base, allowedCapabilities: [] };
        expect(getAgentPermissionChanges(base, draft).turnedOff).toBe(true);
        expect(getAgentPermissionChanges(draft, base).allows).toEqual(all);
        expect(getAgentPermissionChanges(draft, base)).not.toHaveProperty(
            'activity',
        );
        expect(getAgentPermissionChanges(draft, base)).not.toHaveProperty(
            'roles',
        );
    });
});
