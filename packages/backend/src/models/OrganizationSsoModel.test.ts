import { OrganizationSsoProvider } from '@lightdash/common';
import knex, { Knex } from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { OrganizationSsoConfigurationsTableName } from '../database/entities/organizationSsoConfigurations';
import { EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';
import { OrganizationSsoModel } from './OrganizationSsoModel';

const ORG_UUID = '00000000-0000-0000-0000-000000000001';

const storedConfig = {
    oauth2ClientId: 'client-id',
    oauth2ClientSecret: 'secret',
    oauth2TenantId: 'tenant-id',
};

// Stub encryption: decrypt() returns the JSON the model expects to parse,
// encrypt() returns an opaque buffer. The config blob is never inspected here.
const encryptionUtil = {
    encrypt: jest.fn(() => Buffer.from('encrypted')),
    decrypt: jest.fn(() => JSON.stringify(storedConfig)),
} as unknown as EncryptionUtil;

const dbRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
    organization_sso_configuration_uuid: '00000000-0000-0000-0000-0000000000aa',
    organization_uuid: ORG_UUID,
    provider: OrganizationSsoProvider.AZUREAD,
    config: Buffer.from('encrypted'),
    enabled: true,
    override_email_domains: false,
    email_domains: [],
    allow_password: true,
    ...overrides,
});

describe('OrganizationSsoModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new OrganizationSsoModel({
        database: database as unknown as Knex,
        encryptionUtil,
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
        jest.clearAllMocks();
    });

    describe('findEnabledMethodsForEmailDomain', () => {
        it('restricts to enabled rows whose org has verified the domain (EXISTS) and whose override branch matches', async () => {
            tracker.on
                .select(OrganizationSsoConfigurationsTableName)
                .responseOnce([dbRow()]);

            await model.findEnabledMethodsForEmailDomain('acme.com');

            expect(tracker.history.select).toHaveLength(1);
            const { sql, bindings } = tracker.history.select[0];
            const lowered = sql.toLowerCase();

            // Only enabled methods are considered.
            expect(lowered).toContain('"enabled"');
            expect(bindings).toContain(true);

            // Verified-domain EXISTS clause, correlated by organization_uuid and
            // gated on a non-null verified_at.
            expect(lowered).toContain('exists');
            expect(lowered).toContain('organization_domain_verifications');
            expect(lowered).toContain('"verified_at" is not null');

            // Override branch: override=false routes all verified domains;
            // override=true requires the domain to be in the method's subset.
            expect(lowered).toContain('override_email_domains');
            expect(lowered).toContain('= any');
            expect(bindings).toContain(false); // override=false branch
            // Domain appears twice: once in the EXISTS domain match, once in the
            // ANY(email_domains) subset check.
            expect(bindings.filter((b) => b === 'acme.com')).toHaveLength(2);
        });

        it('normalizes the email domain to lowercase before matching', async () => {
            tracker.on
                .select(OrganizationSsoConfigurationsTableName)
                .responseOnce([]);

            await model.findEnabledMethodsForEmailDomain('ACME.com');

            const { bindings } = tracker.history.select[0];
            expect(bindings).toContain('acme.com');
            expect(bindings).not.toContain('ACME.com');
        });

        it('decrypts and maps each row into an OrganizationSsoMethod', async () => {
            tracker.on
                .select(OrganizationSsoConfigurationsTableName)
                .responseOnce([
                    dbRow({
                        override_email_domains: true,
                        email_domains: ['acme.com'],
                        allow_password: false,
                    }),
                ]);

            const methods =
                await model.findEnabledMethodsForEmailDomain('acme.com');

            expect(encryptionUtil.decrypt).toHaveBeenCalledTimes(1);
            expect(methods).toEqual([
                {
                    organizationUuid: ORG_UUID,
                    provider: OrganizationSsoProvider.AZUREAD,
                    config: storedConfig,
                    enabled: true,
                    overrideEmailDomains: true,
                    emailDomains: ['acme.com'],
                    allowPassword: false,
                },
            ]);
        });

        it('defaults a null email_domains column to an empty array', async () => {
            tracker.on
                .select(OrganizationSsoConfigurationsTableName)
                .responseOnce([dbRow({ email_domains: null })]);

            const methods =
                await model.findEnabledMethodsForEmailDomain('acme.com');

            expect(methods[0].emailDomains).toEqual([]);
        });
    });

    describe('findGoogleMethodsForEmailDomain', () => {
        it('matches the verified domain but does NOT filter on enabled, so a disabled policy row is returned', async () => {
            tracker.on
                .select(OrganizationSsoConfigurationsTableName)
                .responseOnce([
                    dbRow({
                        provider: OrganizationSsoProvider.GOOGLE,
                        enabled: false,
                    }),
                ]);

            const methods =
                await model.findGoogleMethodsForEmailDomain('acme.com');

            const { sql, bindings } = tracker.history.select[0];
            const lowered = sql.toLowerCase();
            // Scoped to the google provider rows...
            expect(bindings).toContain(OrganizationSsoProvider.GOOGLE);
            // ...still gated on verified-domain EXISTS + the override branch...
            expect(lowered).toContain('exists');
            expect(lowered).toContain('organization_domain_verifications');
            expect(lowered).toContain('= any');
            // ...but NOT on enabled — a disabled row is exactly what suppresses
            // Google for the org, so it must come back. (The `true` binding here
            // is the override_email_domains=true branch, not an enabled filter.)
            expect(lowered).not.toContain('"enabled"');
            expect(methods).toEqual([
                {
                    organizationUuid: ORG_UUID,
                    enabled: false,
                    allowPassword: true,
                },
            ]);
        });
    });

    describe('findEnabledOktaMethodByStoredIssuer', () => {
        it('selects only fields needed to finish the Okta OAuth flow', async () => {
            tracker.on
                .select(OrganizationSsoConfigurationsTableName)
                .responseOnce([]);

            await model.findEnabledOktaMethodByStoredIssuer(
                'https://example.okta.com',
            );

            const { sql, bindings } = tracker.history.select[0];
            const lowered = sql.toLowerCase();
            const selectList = lowered.slice(0, lowered.indexOf(' from '));
            expect(bindings).toContain(OrganizationSsoProvider.OKTA);
            expect(bindings).toContain(true);
            expect(selectList).toContain('"organization_uuid"');
            expect(selectList).toContain('"config"');
            expect(selectList).not.toContain('"provider"');
            expect(selectList).not.toContain('"enabled"');
            expect(selectList).not.toContain('"override_email_domains"');
            expect(selectList).not.toContain('"email_domains"');
            expect(selectList).not.toContain('"allow_password"');
            expect(lowered).not.toContain('select *');
        });
    });
});
