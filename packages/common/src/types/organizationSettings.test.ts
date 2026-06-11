import {
    resolveEffectiveOrganizationSettings,
    validateCorsAllowedDomains,
    type OrganizationSettingsInstanceDefaults,
} from './organizationSettings';

const INSTANCE_DEFAULTS: OrganizationSettingsInstanceDefaults = {
    enableOidcLinking: false,
    enableOidcToEmailLinking: true,
    scheduledDeliveryExpirationSeconds: 259200, // 3 days (env default)
    queryLimit: 5000,
    csvCellsLimit: 100000,
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
            queryLimit: 5000,
            csvCellsLimit: 100000,
            corsAllowedDomains: [],
        });
    });

    test('export limits resolve to an effective number, inheriting the env when unset', () => {
        const inherited = resolveEffectiveOrganizationSettings(
            {},
            INSTANCE_DEFAULTS,
        );
        expect(inherited.queryLimit).toBe(5000);
        expect(inherited.csvCellsLimit).toBe(100000);
        const overridden = resolveEffectiveOrganizationSettings(
            { queryLimit: 250000, csvCellsLimit: 50000000 },
            INSTANCE_DEFAULTS,
        );
        expect(overridden.queryLimit).toBe(250000);
        expect(overridden.csvCellsLimit).toBe(50000000);
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

    test('CORS settings default to no org domains, without env inheritance', () => {
        const inherited = resolveEffectiveOrganizationSettings(
            {},
            INSTANCE_DEFAULTS,
        );
        expect(inherited.corsAllowedDomains).toEqual([]);

        const overridden = resolveEffectiveOrganizationSettings(
            {
                corsAllowedDomains: [
                    'https://app.example.com',
                    '/^https:\\/\\/.*\\.example\\.com$/',
                ],
            },
            INSTANCE_DEFAULTS,
        );
        expect(overridden.corsAllowedDomains).toEqual([
            'https://app.example.com',
            '/^https:\\/\\/.*\\.example\\.com$/',
        ]);
    });
});

describe('validateCorsAllowedDomains', () => {
    test('accepts exact origins and anchored subdomain regex patterns', () => {
        expect(
            validateCorsAllowedDomains([
                'https://app.example.com',
                '/^https:\\/\\/.*\\.example\\.com$/',
                '/^http:\\/\\/.*\\.example\\.com$/',
            ]),
        ).toBeNull();
    });

    test('accepts leading wildcard subdomain origins', () => {
        expect(
            validateCorsAllowedDomains([
                '*.example.com',
                'https://*.lightdash.example.com',
                'http://*.example.com:3000',
            ]),
        ).toBeNull();
    });

    test('rejects broad or misplaced wildcard origins', () => {
        expect(validateCorsAllowedDomains(['*.com'])).toContain(
            'leading subdomain wildcard',
        );
        expect(validateCorsAllowedDomains(['*'])).toContain(
            'leading subdomain wildcard',
        );
        expect(validateCorsAllowedDomains(['https://foo.*.com'])).toContain(
            'leading subdomain wildcard',
        );
    });

    test('rejects invalid regex patterns', () => {
        expect(validateCorsAllowedDomains(['/unterminated[/'])).toBeTruthy();
    });

    test('rejects unanchored regex patterns', () => {
        expect(validateCorsAllowedDomains(['/example\\.com/'])).toContain(
            'anchored origins',
        );
    });

    test('rejects regex patterns that allow arbitrary external origins', () => {
        expect(validateCorsAllowedDomains(['/.*/'])).toBeTruthy();
        expect(validateCorsAllowedDomains(['/^https?:\\/\\/.*$/'])).toContain(
            'arbitrary external origins',
        );
        expect(
            validateCorsAllowedDomains(['/^https:\\/\\/.*\\.com$/']),
        ).toContain('arbitrary external origins');
    });
});
