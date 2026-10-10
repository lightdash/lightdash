import { AiAccessRefusalReason } from './aiPrincipal';
import { AiAccessRefusedError } from './errors';

test.each([
    AiAccessRefusalReason.AGENT_ACCESS_DISABLED,
    AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
    AiAccessRefusalReason.AGENT_PROJECT_DENIED,
    AiAccessRefusalReason.AGENT_ACTOR_UNVERIFIED,
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
