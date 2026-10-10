import { type AgentPermissionBlocker } from './agentPermissionExplanation';
import {
    getAdditionalAgentPermissionRequirements,
    getAgentPermissionRefusalDetails,
} from './agentPermissionRefusalDetails';
import { AgentCapability, getAgentCapabilityName } from './agentPermissions';
import { AiAccessRefusalReason } from './aiPrincipal';
import { AiAccessRefusedError } from './errors';

const blocker = (
    checkId: string,
    capability: AgentCapability | null = null,
): AgentPermissionBlocker => ({
    checkId,
    capability,
    status: 'refused',
    reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
    policyLayer: 'org_ceiling',
    message: 'Private project name and uuid must not be copied.',
    settingsUrl: null,
});
const primary = blocker(
    `capability:${AgentCapability.RawSql}`,
    AgentCapability.RawSql,
);
const { refusal } = new AiAccessRefusedError(primary.reason, {
    capability: primary.capability,
    policyLayer: primary.policyLayer ?? undefined,
});

test('old refusals and single blockers have no additional requirements', () => {
    expect(getAgentPermissionRefusalDetails(refusal)).toBe('');
    expect(
        getAdditionalAgentPermissionRequirements({
            ...refusal,
            blockers: [primary],
        }),
    ).toEqual([]);
});
test('excludes the primary and deduplicates plain labels without copying details', () => {
    const extra = blocker(
        `capability:${AgentCapability.Publish}`,
        AgentCapability.Publish,
    );
    const enriched = {
        ...refusal,
        blockers: [primary, extra, extra, primary],
        explanationUrl: '/generalSettings/myAgentConnections',
    };
    expect(getAdditionalAgentPermissionRequirements(enriched)).toEqual([
        'Publish and share',
    ]);
    expect(getAgentPermissionRefusalDetails(enriched)).toBe(
        'Also needed: Publish and share\nSee why: /generalSettings/myAgentConnections',
    );
});
test.each(Object.values(AgentCapability))(
    'formats the capability %s by its plain name',
    (capability) => {
        const first = blocker('agent_admission');
        const value = {
            ...refusal,
            reason: AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
            capability: null,
            blockers: [
                {
                    ...first,
                    reason: AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
                },
                blocker(`capability:${capability}`, capability),
            ],
        };
        expect(getAdditionalAgentPermissionRequirements(value)).toEqual([
            getAgentCapabilityName(capability),
        ]);
    },
);
test.each([
    ['content_writes', AgentCapability.ContentWrite, 'Agent content writes'],
    [
        'warehouse_confirmation',
        AgentCapability.RawSql,
        'warehouse confirmation for this project',
    ],
    ['agent_admission', null, 'access to agents'],
    ['project_scope', null, 'this project in the allowed projects'],
] as const)(
    'labels %s by its check, not its capability',
    (checkId, capability, label) => {
        expect(
            getAdditionalAgentPermissionRequirements({
                ...refusal,
                blockers: [
                    primary,
                    {
                        ...blocker(checkId, capability),
                        reason: AiAccessRefusalReason.AGENT_SETTING_DENIED,
                    },
                ],
            }),
        ).toEqual([label]);
    },
);

test('uses the ordered primary blocker when optional top-level metadata is absent', () => {
    const { capability, policyLayer, ...withoutMetadata } = refusal;
    expect(
        getAdditionalAgentPermissionRequirements({
            ...withoutMetadata,
            blockers: [
                primary,
                blocker('capability:publish', AgentCapability.Publish),
            ],
        }),
    ).toEqual(['Publish and share']);
});
