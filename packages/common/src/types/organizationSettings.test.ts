import {
    resolveEffectiveOrganizationSettings,
    type OrganizationSettingsInstanceDefaults,
} from './organizationSettings';

const INSTANCE_DEFAULTS: OrganizationSettingsInstanceDefaults = {
    enableOidcLinking: false,
    enableOidcToEmailLinking: true,
    scheduledDeliveryExpirationSeconds: 259200, // 3 days (env default)
};

describe('resolveEffectiveOrganizationSettings', () => {
    test('falls back to instance defaults when nothing is overridden', () => {
        expect(
            resolveEffectiveOrganizationSettings({}, INSTANCE_DEFAULTS),
        ).toEqual({
            oidcLinkingEnabled: false,
            oidcToEmailLinkingEnabled: true,
            supportImpersonationEnabled: false,
            scheduledDeliveryExpirationSeconds: 259200,
            scheduledDeliveryExpirationSecondsEmail: null,
            scheduledDeliveryExpirationSecondsSlack: null,
            scheduledDeliveryExpirationSecondsMsTeams: null,
            scheduledDeliveryExpirationSecondsGoogleChat: null,
        });
    });

    test('the base expiry resolves to an effective number, inheriting the env when unset', () => {
        expect(
            resolveEffectiveOrganizationSettings({}, INSTANCE_DEFAULTS)
                .scheduledDeliveryExpirationSeconds,
        ).toBe(259200);
        expect(
            resolveEffectiveOrganizationSettings(
                { scheduledDeliveryExpirationSeconds: 604800 },
                INSTANCE_DEFAULTS,
            ).scheduledDeliveryExpirationSeconds,
        ).toBe(604800);
    });

    test('per-channel overrides are surfaced raw (null = inherit base), not resolved', () => {
        const resolved = resolveEffectiveOrganizationSettings(
            { scheduledDeliveryExpirationSecondsSlack: 1209600 },
            INSTANCE_DEFAULTS,
        );
        // Slack carries its explicit override; the other channels stay null so
        // the UI can show "inherit".
        expect(resolved.scheduledDeliveryExpirationSecondsSlack).toBe(1209600);
        expect(resolved.scheduledDeliveryExpirationSecondsEmail).toBeNull();
        expect(resolved.scheduledDeliveryExpirationSecondsMsTeams).toBeNull();
        expect(
            resolved.scheduledDeliveryExpirationSecondsGoogleChat,
        ).toBeNull();
    });

    test('support impersonation is opt-in only (no env default)', () => {
        expect(
            resolveEffectiveOrganizationSettings({}, INSTANCE_DEFAULTS)
                .supportImpersonationEnabled,
        ).toBe(false);
    });
});
