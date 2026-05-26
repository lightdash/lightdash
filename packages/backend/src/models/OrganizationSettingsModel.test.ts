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
    const builder: Record<string, jest.Mock> = {};
    Object.assign(builder, {
        where: jest.fn(() => builder),
        first: jest.fn(async () => row),
        insert: jest.fn((arg: Record<string, unknown>) => {
            captured.insert = arg;
            return builder;
        }),
        onConflict: jest.fn(() => builder),
        merge: jest.fn(async (arg: Record<string, unknown>) => {
            captured.merge = arg;
        }),
    });
    const database = jest.fn(() => builder) as unknown as Knex;
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
            });
        });

        test('maps a sparse stored row, passing NULL columns through as null', async () => {
            // Only one setting was ever written; the other stays NULL (inherit).
            const { model } = createModel({
                oidc_linking_enabled: true,
                oidc_to_email_linking_enabled: null,
            });
            expect(await model.get(ORG)).toEqual({
                oidcLinkingEnabled: true,
                oidcToEmailLinkingEnabled: null,
            });
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
            });
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
            expect(captured.merge?.updated_at).toBeInstanceOf(Date);
            expect(captured.insert).toEqual({ organization_uuid: ORG });
        });
    });
});
