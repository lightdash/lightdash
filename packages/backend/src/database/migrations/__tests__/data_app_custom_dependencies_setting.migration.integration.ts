import { type Knex } from 'knex';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import {
    down,
    up,
} from '../20261109190000_add_data_app_custom_dependencies_to_organization_settings';

const FLAG_ID = 'enable-data-app-custom-dependencies';

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});

const ENV_KEYS = [
    'LIGHTDASH_ENABLE_FEATURE_FLAGS',
    'LIGHTDASH_DISABLE_FEATURE_FLAGS',
] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};
beforeEach(() => {
    ENV_KEYS.forEach((key) => {
        savedEnv[key] = process.env[key];
        delete process.env[key];
    });
});
afterEach(() => {
    ENV_KEYS.forEach((key) => {
        if (savedEnv[key] === undefined) delete process.env[key];
        else process.env[key] = savedEnv[key];
    });
});

type Fixture = {
    overrideTrue: string;
    overrideFalse: string;
    noOverrideWithRow: string;
    noOverrideWithoutRow: string;
};

// Rolls the migration back, seeds orgs and flag rows, then re-runs `up` with
// the given env, all in one transaction that is rolled back afterwards.
const runMigration = async (
    flagDefault: boolean,
    env: Partial<Record<(typeof ENV_KEYS)[number], string>>,
    assert: (trx: Knex, fixture: Fixture) => Promise<void>,
) => {
    const trx = await migrated.database.transaction();
    try {
        await down(trx);
        const [overrideTrue, overrideFalse, withRow, withoutRow] = await trx(
            'organizations',
        )
            .insert([
                { organization_name: 'override true' },
                { organization_name: 'override false' },
                { organization_name: 'no override, settings row' },
                { organization_name: 'no override, no settings row' },
            ])
            .returning('organization_uuid');
        await trx('organization_settings').insert({
            organization_uuid: withRow.organization_uuid,
            oidc_linking_enabled: true,
        });
        await trx('feature_flags').insert({
            flag_id: FLAG_ID,
            default_enabled: flagDefault,
        });
        await trx('feature_flag_overrides').insert([
            {
                flag_id: FLAG_ID,
                organization_uuid: overrideTrue.organization_uuid,
                enabled: true,
            },
            {
                flag_id: FLAG_ID,
                organization_uuid: overrideFalse.organization_uuid,
                enabled: false,
            },
        ]);
        Object.entries(env).forEach(([key, value]) => {
            process.env[key] = value;
        });
        await up(trx);
        await assert(trx, {
            overrideTrue: overrideTrue.organization_uuid,
            overrideFalse: overrideFalse.organization_uuid,
            noOverrideWithRow: withRow.organization_uuid,
            noOverrideWithoutRow: withoutRow.organization_uuid,
        });
    } finally {
        await trx.rollback();
    }
};

const settingFor = async (
    trx: Knex,
    organizationUuid: string,
): Promise<boolean | null> => {
    const row = await trx('organization_settings')
        .where('organization_uuid', organizationUuid)
        .first('data_app_custom_dependencies_enabled');
    return row?.data_app_custom_dependencies_enabled ?? null;
};

test('env enable list turns it on for every org, creating missing rows', async () => {
    await runMigration(
        false,
        { LIGHTDASH_ENABLE_FEATURE_FLAGS: `other-flag, ${FLAG_ID}` },
        async (trx, f) => {
            expect(await settingFor(trx, f.overrideTrue)).toBe(true);
            expect(await settingFor(trx, f.overrideFalse)).toBe(true);
            expect(await settingFor(trx, f.noOverrideWithRow)).toBe(true);
            expect(await settingFor(trx, f.noOverrideWithoutRow)).toBe(true);
            const kept = await trx('organization_settings')
                .where('organization_uuid', f.noOverrideWithRow)
                .first('oidc_linking_enabled');
            expect(kept?.oidc_linking_enabled).toBe(true);
            const orgsWithoutSettings = await trx('organizations')
                .leftJoin(
                    'organization_settings',
                    'organizations.organization_uuid',
                    'organization_settings.organization_uuid',
                )
                .whereNull('organization_settings.organization_uuid');
            expect(orgsWithoutSettings).toHaveLength(0);
        },
    );
});

test('env enable list wins over the disable list', async () => {
    await runMigration(
        false,
        {
            LIGHTDASH_ENABLE_FEATURE_FLAGS: FLAG_ID,
            LIGHTDASH_DISABLE_FEATURE_FLAGS: FLAG_ID,
        },
        async (trx, f) => {
            expect(await settingFor(trx, f.overrideFalse)).toBe(true);
        },
    );
});

test('env disable list keeps it off for every org, even with an override', async () => {
    await runMigration(
        true,
        { LIGHTDASH_DISABLE_FEATURE_FLAGS: FLAG_ID },
        async (trx, f) => {
            expect(await settingFor(trx, f.overrideTrue)).toBeNull();
            expect(await settingFor(trx, f.overrideFalse)).toBeNull();
            expect(await settingFor(trx, f.noOverrideWithRow)).toBe(false);
            expect(await settingFor(trx, f.noOverrideWithoutRow)).toBeNull();
        },
    );
});

test('org overrides decide when no env list names the flag', async () => {
    await runMigration(false, {}, async (trx, f) => {
        // An org with an override true gets a row created.
        expect(await settingFor(trx, f.overrideTrue)).toBe(true);
        expect(await settingFor(trx, f.overrideFalse)).toBeNull();
        expect(await settingFor(trx, f.noOverrideWithRow)).toBe(false);
        expect(await settingFor(trx, f.noOverrideWithoutRow)).toBeNull();
    });
});

test('an override false beats a flag default of true', async () => {
    await runMigration(true, {}, async (trx, f) => {
        expect(await settingFor(trx, f.overrideTrue)).toBe(true);
        expect(await settingFor(trx, f.overrideFalse)).toBeNull();
        // Orgs without an override inherit the flag default.
        expect(await settingFor(trx, f.noOverrideWithRow)).toBe(true);
        expect(await settingFor(trx, f.noOverrideWithoutRow)).toBe(true);
    });
});

test('nothing set leaves every org off', async () => {
    const trx = await migrated.database.transaction();
    try {
        await down(trx);
        const [withRow, withoutRow] = await trx('organizations')
            .insert([
                { organization_name: 'settings row' },
                { organization_name: 'no settings row' },
            ])
            .returning('organization_uuid');
        await trx('organization_settings').insert({
            organization_uuid: withRow.organization_uuid,
        });
        await trx('feature_flag_overrides').where('flag_id', FLAG_ID).delete();
        await trx('feature_flags').where('flag_id', FLAG_ID).delete();
        await up(trx);
        expect(await settingFor(trx, withRow.organization_uuid)).toBe(false);
        expect(await settingFor(trx, withoutRow.organization_uuid)).toBeNull();
        // Inserted later, a row defaults to off.
        const [org] = await trx('organizations')
            .insert({ organization_name: 'created after' })
            .returning('organization_uuid');
        await trx('organization_settings').insert({
            organization_uuid: org.organization_uuid,
        });
        expect(await settingFor(trx, org.organization_uuid)).toBe(false);
    } finally {
        await trx.rollback();
    }
});
