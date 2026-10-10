import { AgentCapability, getAgentCapabilityName } from './agentPermissions';
import {
    AiAccessRefusalAction,
    AiAccessRefusalReason,
    getAgentCapabilityRefusalMessage,
    getAiAccessRefusalMessage,
    type AiAccessRefusal,
} from './aiPrincipal';
import { AiAccessRefusedError } from './errors';

test.each([
    AiAccessRefusalReason.AGENT_ACCESS_DISABLED,
    AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
    AiAccessRefusalReason.AGENT_PROJECT_DENIED,
    AiAccessRefusalReason.AGENT_SETTING_DENIED,
    AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
    AiAccessRefusalReason.AGENT_GRANT_DENIED,
    AiAccessRefusalReason.AGENT_GRANT_REVOKED,
    AiAccessRefusalReason.AGENT_CHANNEL_DENIED,
    AiAccessRefusalReason.AGENT_HUMAN_PERMISSION_DENIED,
])('gives %s a remedy without a connection URL', (reason) => {
    const error = new AiAccessRefusedError(reason);
    expect(error.refusal.settingsUrl).toBe('/generalSettings/agentIdentity');
    expect(error.refusal.connectUrl).toBeNull();
    expect(error.message).not.toContain('Lightdash');
});

test('an unmapped operation has no setting that can grant it', () => {
    expect(
        new AiAccessRefusedError(AiAccessRefusalReason.AGENT_OPERATION_UNMAPPED)
            .refusal.settingsUrl,
    ).toBeNull();
});

test('raw SQL links to the project identity settings', () => {
    expect(
        new AiAccessRefusedError(
            AiAccessRefusalReason.AGENT_RAW_SQL_UNCONFIRMED,
            { projectUuid: 'project' },
        ).refusal.settingsUrl,
    ).toBe('/generalSettings/projectManagement/project/agentIdentity');
});

test('existing identity refusals preserve their default URL', () => {
    expect(
        new AiAccessRefusedError(AiAccessRefusalReason.NEEDS_SIGN_IN).refusal
            .settingsUrl,
    ).toBeNull();
});

test('an unverified Slack actor needs account linking, not admin settings', () => {
    expect(
        new AiAccessRefusedError(AiAccessRefusalReason.AGENT_ACTOR_UNVERIFIED)
            .refusal,
    ).toMatchObject({
        action: AiAccessRefusalAction.SIGN_IN,
        settingsUrl: null,
        connectUrl: null,
        message: 'Connect your Slack account so agents can run as you.',
    });
});

const policyLayers: (AiAccessRefusal['policyLayer'] | null)[] = [
    'org_ceiling',
    'project_scope',
    'organization_setting',
    'warehouse_identity',
    'unmapped',
    null,
    undefined,
];

describe.each(Object.values(AgentCapability))(
    '%s refusal copy',
    (capability) => {
        test.each(policyLayers)(
            'attributes capability denial at %s',
            (policyLayer) => {
                const name = getAgentCapabilityName(capability);
                const message = getAgentCapabilityRefusalMessage(
                    AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                    policyLayer,
                    capability,
                );
                expect(message).toBe(
                    policyLayer === 'org_ceiling'
                        ? `Your organization's agent permissions do not allow ${name}. Ask an admin to change Permissions on the Agents page.`
                        : `Agents cannot use ${name} here. Ask an admin to review agent permissions.`,
                );
                expect(message).not.toContain('roles');
                expect(message).not.toContain(capability);
            },
        );

        test.each(policyLayers)(
            'attributes human permission denial at %s',
            (policyLayer) => {
                const message = getAgentCapabilityRefusalMessage(
                    AiAccessRefusalReason.AGENT_HUMAN_PERMISSION_DENIED,
                    policyLayer,
                    capability,
                );
                expect(message).toBe(
                    `Your roles do not allow ${getAgentCapabilityName(capability)}. Ask an admin to review your permissions.`,
                );
                expect(message).not.toContain(capability);
            },
        );
    },
);

test.each(policyLayers)(
    'uses neutral copy without a capability at %s',
    (policyLayer) => {
        expect(
            getAgentCapabilityRefusalMessage(
                AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                policyLayer,
                null,
            ),
        ).toBe(
            'Agents cannot do this here. Ask an admin to review agent permissions.',
        );
    },
);

test('uses neutral default capability refusal copy', () => {
    expect(
        new AiAccessRefusedError(AiAccessRefusalReason.AGENT_CAPABILITY_DENIED)
            .message,
    ).toBe(
        'Agents cannot do this here. Ask an admin to review agent permissions.',
    );
});

test('preserves human permission copy without a capability', () => {
    expect(
        getAgentCapabilityRefusalMessage(
            AiAccessRefusalReason.AGENT_HUMAN_PERMISSION_DENIED,
            null,
            null,
        ),
    ).toBe(
        getAiAccessRefusalMessage(
            AiAccessRefusalReason.AGENT_HUMAN_PERMISSION_DENIED,
            { projectName: null },
        ),
    );
});

test.each(
    Object.values(AiAccessRefusalReason).filter(
        (reason) =>
            reason !== AiAccessRefusalReason.AGENT_CAPABILITY_DENIED &&
            reason !== AiAccessRefusalReason.AGENT_HUMAN_PERMISSION_DENIED,
    ),
)('preserves %s copy even with a capability', (reason) => {
    expect(
        getAgentCapabilityRefusalMessage(
            reason,
            'org_ceiling',
            AgentCapability.RawSql,
        ),
    ).toBe(getAiAccessRefusalMessage(reason, { projectName: null }));
});
