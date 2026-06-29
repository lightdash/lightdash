import { Knex } from 'knex';
import { OrganizationSettingsModel } from './OrganizationSettingsModel';

type Captured = {
    insert?: Record<string, unknown>;
    merge?: Record<string, unknown>;
};

/**
 * Builds an OrganizationSettingsModel backed by a chainable Knex mock. `row`
 * is what `.first()` resolves to (the row `get` reads — also what `update`
 * re-reads at the end), and `captured` records the args passed to `.insert()`
 * / `.merge()` so we can assert exactly which columns a write touched.
 */
const createModel = (row: Record<string, unknown> | undefined) => {
    const captured: Captured = {};
    const builder: Record<string, import('vitest').Mock> = {};
    Object.assign(builder, {
        where: vi.fn(() => builder),
        first: vi.fn(async () => row),
        insert: vi.fn((arg: Record<string, unknown>) => {
            captured.insert = arg;
            return builder;
        }),
        onConflict: vi.fn(() => builder),
        merge: vi.fn(async (arg: Record<string, unknown>) => {
            captured.merge = arg;
        }),
    });
    const database = vi.fn(() => builder) as unknown as Knex;
    return {
        model: new OrganizationSettingsModel({ database }),
        captured,
    };
};

const ORG = 'org-1';

describe('OrganizationSettingsModel', () => {
    describe('get', () => {
        test('returns all-null (nothing overridden → inherit) when no row exists', async () => {
            const { model } = createModel(undefined);
            expect(await model.get(ORG)).toEqual({
                oidcLinkingEnabled: null,
                oidcToEmailLinkingEnabled: null,
                supportImpersonationEnabled: null,
                scheduledDeliveryExpirationSeconds: null,
                scheduledDeliveryExpirationSecondsEmail: null,
                scheduledDeliveryExpirationSecondsSlack: null,
                scheduledDeliveryExpirationSecondsMsTeams: null,
                scheduledDeliveryExpirationSecondsGoogleChat: null,
                queryLimit: null,
                csvCellsLimit: null,
                corsAllowedDomains: null,
            });
        });

        test('maps a sparse stored row, passing NULL columns through as null', async () => {
            // Only one setting was ever written; the other stays NULL (inherit).
            const { model } = createModel({
                oidc_linking_enabled: true,
                oidc_to_email_linking_enabled: null,
                support_impersonation_enabled: null,
                scheduled_delivery_expiration_seconds: null,
                persistent_download_urls_enabled: null,
            });
            expect(await model.get(ORG)).toEqual({
                oidcLinkingEnabled: true,
                oidcToEmailLinkingEnabled: null,
                supportImpersonationEnabled: null,
                scheduledDeliveryExpirationSeconds: null,
                scheduledDeliveryExpirationSecondsEmail: null,
                scheduledDeliveryExpirationSecondsSlack: null,
                scheduledDeliveryExpirationSecondsMsTeams: null,
                scheduledDeliveryExpirationSecondsGoogleChat: null,
                queryLimit: null,
                csvCellsLimit: null,
                corsAllowedDomains: null,
            });
        });

        test('maps the support impersonation column', async () => {
            const { model } = createModel({
                oidc_linking_enabled: null,
                oidc_to_email_linking_enabled: null,
                support_impersonation_enabled: true,
            });
            expect(await model.get(ORG)).toEqual({
                oidcLinkingEnabled: null,
                oidcToEmailLinkingEnabled: null,
                supportImpersonationEnabled: true,
                scheduledDeliveryExpirationSeconds: null,
                scheduledDeliveryExpirationSecondsEmail: null,
                scheduledDeliveryExpirationSecondsSlack: null,
                scheduledDeliveryExpirationSecondsMsTeams: null,
                scheduledDeliveryExpirationSecondsGoogleChat: null,
                queryLimit: null,
                csvCellsLimit: null,
                corsAllowedDomains: null,
            });
        });

        test('maps the exporting columns (base + per-channel expiry)', async () => {
            const { model } = createModel({
                oidc_linking_enabled: null,
                oidc_to_email_linking_enabled: null,
                support_impersonation_enabled: null,
                scheduled_delivery_expiration_seconds: 604800,
                scheduled_delivery_expiration_seconds_slack: 1209600,
            });
            expect(await model.get(ORG)).toEqual({
                oidcLinkingEnabled: null,
                oidcToEmailLinkingEnabled: null,
                supportImpersonationEnabled: null,
                scheduledDeliveryExpirationSeconds: 604800,
                scheduledDeliveryExpirationSecondsEmail: null,
                scheduledDeliveryExpirationSecondsSlack: 1209600,
                scheduledDeliveryExpirationSecondsMsTeams: null,
                scheduledDeliveryExpirationSecondsGoogleChat: null,
                queryLimit: null,
                csvCellsLimit: null,
                corsAllowedDomains: null,
            });
        });

        test('maps the CORS columns', async () => {
            const { model } = createModel({
                cors_allowed_domains: [
                    'https://app.example.com',
                    '/^https:\\/\\/.*\\.example\\.com$/',
                ],
            });
            expect(await model.get(ORG)).toEqual({
                oidcLinkingEnabled: null,
                oidcToEmailLinkingEnabled: null,
                supportImpersonationEnabled: null,
                scheduledDeliveryExpirationSeconds: null,
                scheduledDeliveryExpirationSecondsEmail: null,
                scheduledDeliveryExpirationSecondsSlack: null,
                scheduledDeliveryExpirationSecondsMsTeams: null,
                scheduledDeliveryExpirationSecondsGoogleChat: null,
                queryLimit: null,
                csvCellsLimit: null,
                corsAllowedDomains: [
                    'https://app.example.com',
                    '/^https:\\/\\/.*\\.example\\.com$/',
                ],
            });
        });
    });

    describe('getAllEnabledCorsAllowedDomains', () => {
        test('returns a flattened list of domains from org rows with CORS entries', async () => {
            const rows = [
                {
                    cors_allowed_domains: [
                        'https://app.example.com',
                        '/^https:\\/\\/.*\\.example\\.com$/',
                    ],
                },
                { cors_allowed_domains: ['https://embed.example.com'] },
            ];
            const builder: Record<string, import('vitest').Mock> = {};
            Object.assign(builder, {
                select: vi.fn(() => builder),
                whereNotNull: vi.fn(async () => rows),
            });
            const database = vi.fn(() => builder) as unknown as Knex;
            const model = new OrganizationSettingsModel({ database });

            await expect(
                model.getAllEnabledCorsAllowedDomains(),
            ).resolves.toEqual([
                'https://app.example.com',
                '/^https:\\/\\/.*\\.example\\.com$/',
                'https://embed.example.com',
            ]);
            expect(builder.whereNotNull).toHaveBeenCalledWith(
                'cors_allowed_domains',
            );
        });
    });

    describe('update', () => {
        test('a partial update only writes the provided column (does not touch the others)', async () => {
            // DB state after the write: the untouched setting kept its value.
            const { model, captured } = createModel({
                oidc_linking_enabled: true,
                oidc_to_email_linking_enabled: false,
            });

            const result = await model.update(ORG, {
                oidcLinkingEnabled: true,
            });

            // insert carries only the org + the one provided column
            expect(captured.insert).toEqual({
                organization_uuid: ORG,
                oidc_linking_enabled: true,
            });
            // merge updates only that column (+ updated_at) — crucially it does
            // NOT include oidc_to_email_linking_enabled, so the existing value
            // is preserved rather than overwritten.
            expect(captured.merge).toHaveProperty('oidc_linking_enabled', true);
            expect(captured.merge).not.toHaveProperty(
                'oidc_to_email_linking_enabled',
            );
            expect(captured.merge?.updated_at).toBeInstanceOf(Date);

            // returns the re-read settings
            expect(result).toEqual({
                oidcLinkingEnabled: true,
                oidcToEmailLinkingEnabled: false,
                supportImpersonationEnabled: null,
                scheduledDeliveryExpirationSeconds: null,
                scheduledDeliveryExpirationSecondsEmail: null,
                scheduledDeliveryExpirationSecondsSlack: null,
                scheduledDeliveryExpirationSecondsMsTeams: null,
                scheduledDeliveryExpirationSecondsGoogleChat: null,
                queryLimit: null,
                csvCellsLimit: null,
                corsAllowedDomains: null,
            });
        });

        test('writes the exporting columns (base + per-channel) when provided', async () => {
            const { model, captured } = createModel({
                scheduled_delivery_expiration_seconds: 604800,
                scheduled_delivery_expiration_seconds_slack: 1209600,
            });

            await model.update(ORG, {
                scheduledDeliveryExpirationSeconds: 604800,
                scheduledDeliveryExpirationSecondsSlack: 1209600,
            });

            expect(captured.insert).toEqual({
                organization_uuid: ORG,
                scheduled_delivery_expiration_seconds: 604800,
                scheduled_delivery_expiration_seconds_slack: 1209600,
            });
            expect(captured.merge).toMatchObject({
                scheduled_delivery_expiration_seconds: 604800,
                scheduled_delivery_expiration_seconds_slack: 1209600,
            });
            // Channels not in the patch are left untouched.
            expect(captured.merge).not.toHaveProperty(
                'scheduled_delivery_expiration_seconds_email',
            );
            expect(captured.merge).not.toHaveProperty('oidc_linking_enabled');
        });

        test('writes the support impersonation column when provided', async () => {
            const { model, captured } = createModel({
                support_impersonation_enabled: true,
            });

            await model.update(ORG, { supportImpersonationEnabled: true });

            expect(captured.insert).toEqual({
                organization_uuid: ORG,
                support_impersonation_enabled: true,
            });
            expect(captured.merge).toHaveProperty(
                'support_impersonation_enabled',
                true,
            );
            expect(captured.merge).not.toHaveProperty('oidc_linking_enabled');
        });

        test('writes the CORS columns when provided', async () => {
            const { model, captured } = createModel({
                cors_allowed_domains: [
                    'https://app.example.com',
                    '/^https:\\/\\/.*\\.example\\.com$/',
                ],
            });

            await model.update(ORG, {
                corsAllowedDomains: [
                    'https://app.example.com',
                    '/^https:\\/\\/.*\\.example\\.com$/',
                ],
            });

            expect(captured.insert).toEqual({
                organization_uuid: ORG,
                cors_allowed_domains: [
                    'https://app.example.com',
                    '/^https:\\/\\/.*\\.example\\.com$/',
                ],
            });
            expect(captured.merge).toMatchObject({
                cors_allowed_domains: [
                    'https://app.example.com',
                    '/^https:\\/\\/.*\\.example\\.com$/',
                ],
            });
            expect(captured.merge).not.toHaveProperty('oidc_linking_enabled');
        });

        test('updating multiple settings writes all provided columns', async () => {
            const { model, captured } = createModel({
                oidc_linking_enabled: true,
                oidc_to_email_linking_enabled: true,
            });

            await model.update(ORG, {
                oidcLinkingEnabled: true,
                oidcToEmailLinkingEnabled: true,
            });

            expect(captured.merge).toMatchObject({
                oidc_linking_enabled: true,
                oidc_to_email_linking_enabled: true,
            });
        });

        test('an empty patch touches no setting columns (only updated_at)', async () => {
            const { model, captured } = createModel({
                oidc_linking_enabled: false,
                oidc_to_email_linking_enabled: false,
            });

            await model.update(ORG, {});

            expect(captured.merge).not.toHaveProperty('oidc_linking_enabled');
            expect(captured.merge).not.toHaveProperty(
                'oidc_to_email_linking_enabled',
            );
            expect(captured.merge).not.toHaveProperty(
                'support_impersonation_enabled',
            );
            expect(captured.merge).not.toHaveProperty(
                'scheduled_delivery_expiration_seconds',
            );
            expect(captured.merge).not.toHaveProperty(
                'scheduled_delivery_expiration_seconds_slack',
            );
            expect(captured.merge).not.toHaveProperty('cors_allowed_domains');
            expect(captured.merge?.updated_at).toBeInstanceOf(Date);
            expect(captured.insert).toEqual({ organization_uuid: ORG });
        });
    });
});
