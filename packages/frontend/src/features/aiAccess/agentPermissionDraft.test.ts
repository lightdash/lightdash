import {
    AgentCapability,
    OrganizationMemberRole,
    type AgentCapabilityPolicyOverview,
    type AgentSystemRoleMatrix,
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
    normaliseAgentPermissionDraft,
    sameAgentPermissionDraft,
} from './agentPermissionDraft';

const all = Object.values(AgentCapability);
const read = [
    AgentCapability.ReadDiscover,
    AgentCapability.Query,
    AgentCapability.Export,
    AgentCapability.RawSql,
];
const matrix = (caps: AgentCapability[]) =>
    Object.fromEntries(
        Object.values(OrganizationMemberRole).map((role) => [role, [...caps]]),
    ) as AgentSystemRoleMatrix;
const policy = (
    overrides: Partial<AgentCapabilityPolicyOverview> = {},
): AgentCapabilityPolicyOverview => ({
    mode: 'legacy',
    version: 4,
    allowedCapabilities: null,
    allowedGroupUuids: null,
    systemRoleMatrix: matrix([]),
    defaults: matrix(all),
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
                systemRoleMatrix: matrix(read),
            }),
        );
        const reordered = policyToDraft(
            policy({
                mode: 'managed',
                version: 9,
                allowedCapabilities: [...read].reverse(),
                allowedGroupUuids: ['b', 'a'],
                systemRoleMatrix: matrix([...read].reverse()),
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
                systemRoleMatrix: {
                    ...reordered.systemRoleMatrix,
                    [OrganizationMemberRole.ADMIN]: [AgentCapability.Query],
                },
            }),
        ).toBe(false);
        expect(
            sameAgentPermissionDraft(saved, { ...reordered, mode: 'legacy' }),
        ).toBe(false);
    });
    it('starts Custom with eleven capabilities and six full rows, counting the mode once', () => {
        const baseline = policyToDraft(policy());
        const draft = chooseAgentPermission(baseline, 'custom', baseline);
        expect(draft.allowedCapabilities).toEqual(all);
        expect(draft.systemRoleMatrix).toEqual(matrix(all));
        expect(count(baseline, draft)).toBe(1);
    });
    it('recognises Read and query only with the exact list and every exact row', () => {
        const draft = chooseAgentPermission(
            policyToDraft(policy()),
            'read',
            policyToDraft(policy()),
        );
        expect(draft.allowedCapabilities).toEqual(read);
        expect(draft.systemRoleMatrix).toEqual(matrix(read));
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
                systemRoleMatrix: {
                    ...draft.systemRoleMatrix,
                    admin: [AgentCapability.Query],
                },
            }),
        ).toBe('custom');
        expect(
            getAgentPermissionChoice({ ...draft, allowedCapabilities: all }),
        ).toBe('custom');
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
        expect(custom.systemRoleMatrix).toEqual(matrix(all));
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
    it('restores saved Custom capabilities and narrowed role rows', () => {
        const nine = all.filter(
            (cap) =>
                cap !== AgentCapability.Delete &&
                cap !== AgentCapability.Publish,
        );
        const base = policyToDraft(
            policy({
                mode: 'managed',
                allowedCapabilities: nine,
                systemRoleMatrix: {
                    ...matrix(nine),
                    admin: [AgentCapability.Query],
                },
            }),
        );
        const readDraft = chooseAgentPermission(base, 'read', base);
        const restored = chooseAgentPermission(readDraft, 'custom', base);
        expect(restored).toEqual(base);
        expect(count(base, restored)).toBe(0);
        expect(chooseAgentPermission(base, 'custom', base)).toBe(base);
    });
    it('preserves dormant rows on a legacy group-only save', () => {
        const baseline = policyToDraft(
            policy({ systemRoleMatrix: matrix(read) }),
        );
        expect(baseline.systemRoleMatrix).toEqual(matrix(read));
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
            systemRoleMatrix: matrix(read),
        });
    });
    it('keeps historical rows and starts clean, then writes the visible list on a group-only save', () => {
        const baseline = policyToDraft(
            policy({ mode: 'managed', systemRoleMatrix: matrix(read) }),
        );
        expect(getAgentPermissionChoice(baseline)).toBe('custom');
        expect(baseline.allowedCapabilities).toEqual(all);
        expect(baseline.systemRoleMatrix).toEqual(matrix(read));
        expect(count(baseline, baseline)).toBe(0);
        const draft = { ...baseline, allowedGroupUuids: ['a'] };
        const changes = getAgentPermissionChanges(baseline, draft);
        expect(changes.stops).toEqual([]);
        expect(changes.allows).toEqual([]);
        expect(count(baseline, draft)).toBe(1);
        expect(draftToPolicyRequest(baseline, draft)).toMatchObject({
            version: 4,
            allowedCapabilities: all,
            systemRoleMatrix: matrix(read),
            allowedGroupUuids: ['a'],
        });
    });
    it('removes global capabilities from every row, restores them to every row and counts once each', () => {
        const base = chooseAgentPermission(
            policyToDraft(policy()),
            'custom',
            policyToDraft(policy()),
        );
        const draft = toggleAgentCapability(
            toggleAgentCapability(base, AgentCapability.Delete),
            AgentCapability.Publish,
        );
        expect(draft.systemRoleMatrix.admin).not.toContain(
            AgentCapability.Delete,
        );
        expect(count(base, draft)).toBe(2);
        expect(getAgentPermissionChanges(base, draft).stops).toEqual(
            expect.arrayContaining([
                AgentCapability.Delete,
                AgentCapability.Publish,
            ]),
        );
        expect(getAgentPermissionChanges(base, draft).roles).toEqual([]);
        expect(
            toggleAgentCapability(draft, AgentCapability.Delete)
                .systemRoleMatrix,
        ).toEqual(matrix(all.filter((c) => c !== AgentCapability.Publish)));
        expect(
            count(
                base,
                toggleAgentCapability(
                    toggleAgentCapability(draft, AgentCapability.Delete),
                    AgentCapability.Publish,
                ),
            ),
        ).toBe(0);
    });
    it('counts advanced edits separately and cannot restore a globally disabled cell', () => {
        const base = chooseAgentPermission(
            policyToDraft(policy()),
            'custom',
            policyToDraft(policy()),
        );
        const draft = {
            ...base,
            systemRoleMatrix: {
                ...base.systemRoleMatrix,
                admin: all.filter((c) => c !== AgentCapability.Delete),
            },
        };
        expect(count(base, draft)).toBe(1);
        expect(getAgentPermissionChanges(base, draft).roles).toEqual([
            {
                role: OrganizationMemberRole.ADMIN,
                stops: [AgentCapability.Delete],
                allows: [],
            },
        ]);
        expect(
            normaliseAgentPermissionDraft({ ...draft, allowedCapabilities: [] })
                .systemRoleMatrix,
        ).toEqual(matrix([]));
    });
    it('ignores group and capability order, version and inactive role rows', () => {
        const base = policyToDraft(policy({ allowedGroupUuids: ['a', 'b'] }));
        expect(
            count(base, {
                ...base,
                version: 8,
                allowedGroupUuids: ['b', 'a'],
                systemRoleMatrix: matrix([]),
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
                systemRoleMatrix: matrix(read),
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
            systemRoleMatrix: matrix(read),
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
        const draft = {
            ...base,
            allowedCapabilities: [],
            systemRoleMatrix: matrix([]),
        };
        expect(getAgentPermissionChanges(base, draft).turnedOff).toBe(true);
        expect(getAgentPermissionChanges(draft, base).allows).toEqual(all);
        expect(getAgentPermissionChanges(draft, base)).not.toHaveProperty(
            'activity',
        );
    });
});
