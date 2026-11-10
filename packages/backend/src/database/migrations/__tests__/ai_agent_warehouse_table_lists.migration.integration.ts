import {
    BigqueryAuthenticationType,
    UnexpectedServerError,
    UserWarehouseCredentialPurpose,
    WarehouseTableType,
    WarehouseTypes,
    type WarehouseTablesCatalog,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { AiServiceAccountCredentialsModel } from '../../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';
import { UserWarehouseCredentialsModel } from '../../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import {
    WarehouseAvailableTablesModel,
    type AgentTableListKey,
} from '../../../models/WarehouseAvailableTablesModel/WarehouseAvailableTablesModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import {
    down,
    up,
} from '../20261105120000_create_ai_agent_warehouse_table_lists';

const SECRET = 'agent-table-lists-test-secret';
const encryptionUtil = new EncryptionUtil({
    lightdashConfig: {
        lightdashSecret: SECRET,
        lightdashSecrets: { active: SECRET, all: [SECRET], fallbacks: [] },
    },
});
const TABLE = 'ai_agent_warehouse_table_lists';
const scopeA = 'a'.repeat(64);
const scopeB = 'b'.repeat(64);
const serviceAccount = (privateKey: string) =>
    ({
        type: WarehouseTypes.BIGQUERY,
        authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
        keyfileContents: {
            type: 'service_account',
            private_key: privateKey,
            client_email: 'agent@example.com',
        },
    }) as const;
const catalogFor = (name: string): WarehouseTablesCatalog => ({
    warehouse: {
        public: { [name]: { tableType: WarehouseTableType.TABLE } },
    },
});
const tableNames = (catalog: WarehouseTablesCatalog | null) =>
    catalog === null
        ? null
        : Object.values(catalog).flatMap((schemas) =>
              Object.values(schemas).flatMap((tables) => Object.keys(tables)),
          );

let migrated: MigratedDatabase;

beforeAll(async () => {
    migrated = await createMigratedDatabase(undefined, { min: 0, max: 12 });
});

afterAll(async () => {
    await migrated?.destroy();
});

const fixture = async () => {
    const { database } = migrated;
    const [organization] = await database('organizations')
        .insert({ organization_name: 'Agent table lists' })
        .returning('*');
    const createUser = async () => {
        const [user] = await database('users')
            .insert({ first_name: 'Agent', last_name: 'Lists' } as never)
            .returning('user_uuid');
        return user.user_uuid as string;
    };
    const createProject = async (name: string) => {
        const [project] = await database('projects')
            .insert({
                name,
                organization_id: organization.organization_id,
            } as never)
            .returning(['project_id', 'project_uuid']);
        await database('warehouse_credentials').insert({
            project_id: project.project_id,
            warehouse_type: WarehouseTypes.SNOWFLAKE,
            encrypted_credentials: encryptionUtil.encrypt('{}'),
        } as never);
        return project.project_uuid as string;
    };
    const userCredentials = new UserWarehouseCredentialsModel({
        database,
        encryptionUtil,
    });
    const signIn = (userUuid: string) =>
        userCredentials.upsertAiSnowflakeCredential(
            userUuid,
            'refresh-token',
            null,
            {
                organizationUuid: organization.organization_uuid,
                clientVersion: null,
            },
            { strictPersonalOverlay: false },
        );
    return {
        database,
        person: await createUser(),
        otherPerson: await createUser(),
        projectA: await createProject('Project A'),
        projectB: await createProject('Project B'),
        signIn,
        userCredentials,
        slots: new AiServiceAccountCredentialsModel({
            database,
            encryptionUtil,
        }),
        model: new WarehouseAvailableTablesModel(database),
    };
};

const signInKey = (
    userUuid: string,
    userWarehouseCredentialsUuid: string,
    projectUuid: string,
    scopeFingerprint = scopeA,
): AgentTableListKey => ({
    owner: { kind: 'agent_sign_in', userUuid, userWarehouseCredentialsUuid },
    projectUuid,
    scopeFingerprint,
});

const slotKey = (
    slot: { uuid: string; identityUuid: string },
    projectUuid: string,
    scopeFingerprint = scopeA,
): AgentTableListKey => ({
    owner: {
        kind: 'ai_service_account',
        slotUuid: slot.uuid,
        identityUuid: slot.identityUuid,
    },
    projectUuid,
    scopeFingerprint,
});

const lockWaiters = async () => {
    const { rows } = await migrated.database.raw(
        `SELECT count(*)::int AS waiting FROM pg_stat_activity
         WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    return rows[0].waiting as number;
};

const waitForLockWaiters = async (count: number) => {
    for (let attempt = 0; attempt < 400; attempt += 1) {
        // eslint-disable-next-line no-await-in-loop
        if ((await lockWaiters()) >= count) return;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
            setTimeout(resolve, 25);
        });
    }
    throw new Error(`Timed out waiting for ${count} lock waiters`);
};

const holdListRow = async (
    row: Record<string, unknown>,
): Promise<{ trx: Knex.Transaction; release: () => Promise<void> }> => {
    const trx = await migrated.database.transaction();
    await trx(TABLE).insert({
        credential_generation: '00000000-0000-4000-8000-000000000000',
        tables: catalogFor('blocker'),
        ...row,
    } as never);
    return {
        trx,
        release: async () => {
            await trx.rollback();
        },
    };
};

const interleave = async <First, Second>(
    row: Record<string, unknown>,
    first: () => Promise<First>,
    second: () => Promise<Second>,
    holdMs = 0,
): Promise<[First, Second]> => {
    const blocker = await holdListRow(row);
    let released = false;
    const release = async () => {
        if (released) return;
        released = true;
        await blocker.release();
    };
    try {
        const waiting = await lockWaiters();
        const firstResult = first();
        firstResult.catch(() => undefined);
        await waitForLockWaiters(waiting + 1);
        const secondResult = second();
        secondResult.catch(() => undefined);
        await waitForLockWaiters(waiting + 2);
        if (holdMs > 0)
            await new Promise((resolve) => {
                setTimeout(resolve, holdMs);
            });
        await release();
        return await Promise.all([firstResult, secondResult]);
    } finally {
        await release();
    }
};

describe('migration', () => {
    test('creates the table without changing the person table lists', async () => {
        const before = await migrated
            .database('warehouse_credentials_available_tables')
            .columnInfo();
        await migrated.database.transaction(async (trx) => {
            await down(trx);
            expect(await trx.schema.hasTable(TABLE)).toBe(false);
            await up(trx);
            expect(await trx.schema.hasTable(TABLE)).toBe(true);
        });
        expect(
            await migrated
                .database('warehouse_credentials_available_tables')
                .columnInfo(),
        ).toEqual(before);
    });

    test('rejects a row whose owner columns do not match its kind', async () => {
        const f = await fixture();
        await expect(
            f.database(TABLE).insert({
                owner_kind: 'agent_sign_in',
                user_uuid: null,
                ai_service_account_credential_uuid: null,
                credential_generation: f.person,
                project_uuid: f.projectA,
                scope_fingerprint: scopeA,
                tables: catalogFor('orders'),
            }),
        ).rejects.toThrow(/ai_agent_warehouse_table_lists_owner/);
        await expect(
            f.database(TABLE).insert({
                owner_kind: 'agent_sign_in',
                user_uuid: f.person,
                ai_service_account_credential_uuid: null,
                credential_generation: f.person,
                project_uuid: f.projectA,
                scope_fingerprint: 'not-a-fingerprint',
                tables: catalogFor('orders'),
            }),
        ).rejects.toThrow(/scope_fingerprint/);
    });
});

describe('keys', () => {
    test('keeps one list per identity, project and scope', async () => {
        const f = await fixture();
        const signIn = await f.signIn(f.person);
        const otherSignIn = await f.signIn(f.otherPerson);
        const slot = await f.slots.upsert(
            f.projectA,
            null,
            serviceAccount('key-one'),
            f.person,
        );
        const keys = {
            signInA: signInKey(f.person, signIn, f.projectA),
            signInB: signInKey(f.person, signIn, f.projectB),
            signInScopeB: signInKey(f.person, signIn, f.projectA, scopeB),
            otherSignIn: signInKey(f.otherPerson, otherSignIn, f.projectA),
            slotA: slotKey(slot, f.projectA),
            slotB: slotKey(slot, f.projectB),
        };
        for (const [name, key] of Object.entries(keys)) {
            // eslint-disable-next-line no-await-in-loop
            await expect(
                f.model.saveAgentTableList(key, catalogFor(name)),
            ).resolves.toBe('saved');
        }
        for (const [name, key] of Object.entries(keys)) {
            // eslint-disable-next-line no-await-in-loop
            expect(tableNames(await f.model.getAgentTableList(key))).toEqual([
                name,
            ]);
        }
    });

    test.each([
        { name: 'null', key: null },
        { name: 'missing owner', key: { projectUuid: 'x' } },
        {
            name: 'null owner ids',
            key: {
                owner: {
                    kind: 'agent_sign_in',
                    userUuid: null,
                    userWarehouseCredentialsUuid: null,
                },
                projectUuid: null,
                scopeFingerprint: scopeA,
            },
        },
        {
            name: 'unknown owner kind',
            key: {
                owner: {
                    kind: 'person',
                    userUuid: '0b000000-0000-4000-8000-000000000001',
                    userWarehouseCredentialsUuid:
                        '0b000000-0000-4000-8000-000000000001',
                },
                projectUuid: '0b000000-0000-4000-8000-000000000001',
                scopeFingerprint: scopeA,
            },
        },
        {
            name: 'invalid scope',
            key: {
                owner: {
                    kind: 'ai_service_account',
                    slotUuid: '0b000000-0000-4000-8000-000000000001',
                    identityUuid: '0b000000-0000-4000-8000-000000000001',
                },
                projectUuid: '0b000000-0000-4000-8000-000000000001',
                scopeFingerprint: "' OR 1=1 --",
            },
        },
    ])(
        'rejects a $name key before any query and leaves person lists untouched',
        async ({ key }) => {
            const f = await fixture();
            await f.model.createAvailableTablesForProjectWarehouseCredentials(
                f.projectA,
                [
                    {
                        database: 'warehouse',
                        schema: 'public',
                        table: 'person_table',
                        tableType: WarehouseTableType.TABLE,
                    },
                ],
            );
            const queries: string[] = [];
            const record = (query: { sql: string }) => queries.push(query.sql);
            f.database.on('query', record);
            try {
                await expect(
                    f.model.getAgentTableList(key as AgentTableListKey),
                ).rejects.toThrow(UnexpectedServerError);
                await expect(
                    f.model.saveAgentTableList(
                        key as AgentTableListKey,
                        catalogFor('attack'),
                    ),
                ).rejects.toThrow(UnexpectedServerError);
            } finally {
                f.database.off('query', record);
            }
            expect(queries).toEqual([]);
            expect(
                tableNames(
                    await f.model.getTablesForProjectWarehouseCredentials(
                        f.projectA,
                    ),
                ),
            ).toEqual(['person_table']);
        },
    );
});

describe('generations', () => {
    test('a replaced shared account starts empty and a late save for the old credential is skipped', async () => {
        const f = await fixture();
        const first = await f.slots.upsert(
            f.projectA,
            null,
            serviceAccount('key-one'),
            f.person,
        );
        await f.model.saveAgentTableList(
            slotKey(first, f.projectA),
            catalogFor('first'),
        );
        const replaced = await f.slots.upsert(
            f.projectA,
            null,
            serviceAccount('key-two'),
            f.person,
        );
        expect(replaced.uuid).toBe(first.uuid);
        expect(
            await f.model.getAgentTableList(slotKey(replaced, f.projectA)),
        ).toBeNull();
        await f.model.saveAgentTableList(
            slotKey(replaced, f.projectA),
            catalogFor('second'),
        );

        await expect(
            f.model.saveAgentTableList(
                slotKey(first, f.projectA),
                catalogFor('late_first'),
            ),
        ).resolves.toBe('stale');
        expect(
            tableNames(
                await f.model.getAgentTableList(slotKey(replaced, f.projectA)),
            ),
        ).toEqual(['second']);
        expect(
            await f.model.getAgentTableList(slotKey(first, f.projectA)),
        ).toBeNull();
    });

    test('a new agent sign-in starts empty and a late save for the old sign-in is skipped', async () => {
        const f = await fixture();
        const first = await f.signIn(f.person);
        await f.model.saveAgentTableList(
            signInKey(f.person, first, f.projectA),
            catalogFor('first'),
        );
        const second = await f.signIn(f.person);
        expect(second).not.toBe(first);
        expect(
            await f.model.getAgentTableList(
                signInKey(f.person, second, f.projectA),
            ),
        ).toBeNull();
        await expect(
            f.model.saveAgentTableList(
                signInKey(f.person, first, f.projectA),
                catalogFor('late_first'),
            ),
        ).resolves.toBe('stale');
        await expect(
            f.model.saveAgentTableList(
                signInKey(f.person, second, f.projectA),
                catalogFor('second'),
            ),
        ).resolves.toBe('saved');
        expect(
            tableNames(
                await f.model.getAgentTableList(
                    signInKey(f.person, second, f.projectA),
                ),
            ),
        ).toEqual(['second']);
    });

    test('a sign-in key for another person is skipped', async () => {
        const f = await fixture();
        const signIn = await f.signIn(f.person);
        await expect(
            f.model.saveAgentTableList(
                signInKey(f.otherPerson, signIn, f.projectA),
                catalogFor('wrong_owner'),
            ),
        ).resolves.toBe('stale');
        expect(
            await f.database(TABLE).where('user_uuid', f.otherPerson),
        ).toEqual([]);
    });

    test('deleting a credential, person or project deletes its lists', async () => {
        const f = await fixture();
        const signIn = await f.signIn(f.person);
        const slot = await f.slots.upsert(
            f.projectA,
            null,
            serviceAccount('key-one'),
            f.person,
        );
        await f.model.saveAgentTableList(
            slotKey(slot, f.projectB),
            catalogFor('slot'),
        );
        await f.model.saveAgentTableList(
            signInKey(f.person, signIn, f.projectB),
            catalogFor('sign_in'),
        );
        await f.model.saveAgentTableList(
            signInKey(f.person, signIn, f.projectA),
            catalogFor('sign_in_a'),
        );

        await f.slots.delete(f.projectA, null);
        expect(
            await f
                .database(TABLE)
                .where('ai_service_account_credential_uuid', slot.uuid),
        ).toEqual([]);
        await f.database('projects').where('project_uuid', f.projectB).delete();
        expect(
            await f.database(TABLE).where('project_uuid', f.projectB),
        ).toEqual([]);
        await f.database('users').where('user_uuid', f.person).delete();
        expect(await f.database(TABLE).where('user_uuid', f.person)).toEqual(
            [],
        );
    });
});

describe('concurrency', () => {
    test('concurrent first saves for one key leave one row', async () => {
        const f = await fixture();
        const slot = await f.slots.upsert(
            f.projectA,
            null,
            serviceAccount('key-one'),
            f.person,
        );
        const results = await Promise.all(
            [1, 2, 3, 4, 5].map((index) =>
                f.model.saveAgentTableList(
                    slotKey(slot, f.projectA),
                    catalogFor(`save_${index}`),
                ),
            ),
        );
        expect(results).toEqual(Array(5).fill('saved'));
        expect(
            await f
                .database(TABLE)
                .where('ai_service_account_credential_uuid', slot.uuid),
        ).toHaveLength(1);
    });

    test('a shared account replaced while its old list save waits does not deadlock, and the new list wins', async () => {
        const f = await fixture();
        const first = await f.slots.upsert(
            f.projectA,
            null,
            serviceAccount('key-one'),
            f.person,
        );
        const [oldSave, replacement] = await interleave(
            {
                owner_kind: 'ai_service_account',
                ai_service_account_credential_uuid: first.uuid,
                project_uuid: f.projectA,
                scope_fingerprint: scopeA,
            },
            () =>
                f.model.saveAgentTableList(
                    slotKey(first, f.projectA),
                    catalogFor('first'),
                ),
            () =>
                f.slots.upsert(
                    f.projectA,
                    null,
                    serviceAccount('key-two'),
                    f.person,
                ),
        );

        expect(oldSave).toBe('saved');
        const replaced = replacement;
        expect(replaced.identityUuid).not.toBe(first.identityUuid);
        expect(
            await f.model.getAgentTableList(slotKey(replaced, f.projectA)),
        ).toBeNull();
        await f.model.saveAgentTableList(
            slotKey(replaced, f.projectA),
            catalogFor('second'),
        );
        await expect(
            f.model.saveAgentTableList(
                slotKey(first, f.projectA),
                catalogFor('late_first'),
            ),
        ).resolves.toBe('stale');
        expect(
            tableNames(
                await f.model.getAgentTableList(slotKey(replaced, f.projectA)),
            ),
        ).toEqual(['second']);
    });

    test('an unchanged agent sign-in upsert waits for a list save and then succeeds', async () => {
        const f = await fixture();
        const first = await f.signIn(f.person);
        await f.model.saveAgentTableList(
            signInKey(f.person, first, f.projectB),
            catalogFor('saved_before'),
        );
        const [save, reSignIn] = await interleave(
            {
                owner_kind: 'agent_sign_in',
                user_uuid: f.person,
                project_uuid: f.projectA,
                scope_fingerprint: scopeA,
            },
            () =>
                f.model.saveAgentTableList(
                    signInKey(f.person, first, f.projectA),
                    catalogFor('first'),
                ),
            () => f.signIn(f.person),
        );

        expect(save).toBe('saved');
        const second = reSignIn;
        expect(second).not.toBe(first);
        await expect(
            f.model.saveAgentTableList(
                signInKey(f.person, first, f.projectA),
                catalogFor('late_first'),
            ),
        ).resolves.toBe('stale');
        expect(
            await f.model.getAgentTableList(
                signInKey(f.person, second, f.projectA),
            ),
        ).toBeNull();
    });

    test('a routine refresh-token rotation waits for an in-flight save and keeps the generation', async () => {
        const f = await fixture();
        const signIn = await f.signIn(f.person);
        let rotationStartedAt = 0;
        const [save, rotation] = await interleave(
            {
                owner_kind: 'agent_sign_in',
                user_uuid: f.person,
                project_uuid: f.projectA,
                scope_fingerprint: scopeA,
            },
            () =>
                f.model.saveAgentTableList(
                    signInKey(f.person, signIn, f.projectA),
                    catalogFor('orders'),
                ),
            async () => {
                rotationStartedAt = Date.now();
                const rotated = await f.userCredentials.rotateRefreshToken(
                    signIn,
                    'refresh-token',
                    'rotated-refresh-token',
                );
                return { rotated, waitedMs: Date.now() - rotationStartedAt };
            },
            3500,
        );

        expect(save).toBe('saved');
        expect(rotation.rotated).toBe(true);
        expect(rotation.waitedMs).toBeGreaterThanOrEqual(3000);
        expect(
            await f
                .database('user_warehouse_credentials')
                .where('user_uuid', f.person)
                .andWhere('purpose', UserWarehouseCredentialPurpose.AI)
                .pluck('user_warehouse_credentials_uuid'),
        ).toEqual([signIn]);
        expect(
            tableNames(
                await f.model.getAgentTableList(
                    signInKey(f.person, signIn, f.projectA),
                ),
            ),
        ).toEqual(['orders']);
    });

    test('deleting a project while a list save waits does not deadlock', async () => {
        const f = await fixture();
        const slot = await f.slots.upsert(
            f.projectA,
            null,
            serviceAccount('key-one'),
            f.person,
        );
        const [save, deleteProject] = await interleave(
            {
                owner_kind: 'ai_service_account',
                ai_service_account_credential_uuid: slot.uuid,
                project_uuid: f.projectA,
                scope_fingerprint: scopeA,
            },
            () =>
                f.model.saveAgentTableList(
                    slotKey(slot, f.projectA),
                    catalogFor('orders'),
                ),
            () =>
                (async () =>
                    f
                        .database('projects')
                        .where('project_uuid', f.projectA)
                        .delete())(),
        );

        expect(save).toBe('saved');
        expect(deleteProject).toBe(1);
        expect(
            await f.database(TABLE).where('project_uuid', f.projectA),
        ).toEqual([]);
    });

    test('simultaneous first agent sign-ins, re-sign-ins and list saves all finish', async () => {
        const f = await fixture();
        const firstSignIns = await Promise.all([
            f.signIn(f.person),
            f.signIn(f.person),
            f.signIn(f.otherPerson),
        ]);
        const [saveOne, saveTwo, reSignIn, otherSave] = await Promise.all([
            f.model.saveAgentTableList(
                signInKey(f.person, firstSignIns[0], f.projectA),
                catalogFor('one'),
            ),
            f.model.saveAgentTableList(
                signInKey(f.person, firstSignIns[1], f.projectA),
                catalogFor('two'),
            ),
            f.signIn(f.person),
            f.model.saveAgentTableList(
                signInKey(f.otherPerson, firstSignIns[2], f.projectA),
                catalogFor('other'),
            ),
        ]);

        expect(otherSave).toBe('saved');
        expect(['saved', 'stale']).toContain(saveOne);
        expect(['saved', 'stale']).toContain(saveTwo);
        expect(
            await f.model.getAgentTableList(
                signInKey(f.person, reSignIn, f.projectA),
            ),
        ).toBeNull();
        expect(
            await f.database(TABLE).where('user_uuid', f.person),
        ).toHaveLength([saveOne, saveTwo].includes('saved') ? 1 : 0);
    });
});

describe('previous release compatibility', () => {
    test('the unchanged agent sign-in upsert works while lists exist, and after the table is dropped', async () => {
        const f = await fixture();
        const first = await f.signIn(f.person);
        await f.model.saveAgentTableList(
            signInKey(f.person, first, f.projectA),
            catalogFor('first'),
        );

        const second = await f.signIn(f.person);
        expect(second).not.toBe(first);

        await migrated.database.transaction(async (trx) => {
            await down(trx);
        });
        try {
            const third = await f.signIn(f.person);
            expect(third).not.toBe(second);
        } finally {
            await migrated.database.transaction(async (trx) => {
                await up(trx);
            });
        }
    });
});
