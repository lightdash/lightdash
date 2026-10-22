import { DbtProjectType, NotFoundError } from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import {
    ProjectDbtSourcesTableName,
    type DbProjectDbtSource,
} from '../database/entities/projectDbtSources';
import { type EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';
import { withPeerDbtSourcesOperation } from '../utils/peerDbtSourcesOperation';
import { ProjectDbtSourcesModel } from './ProjectDbtSourcesModel';

describe('ProjectDbtSourcesModel', () => {
    const upstreamProjectUuid = '11111111-1111-4111-8111-111111111111';
    const previewProjectUuid = '22222222-2222-4222-8222-222222222222';
    const githubCiphertext = Buffer.from('github-source-ciphertext');
    const gitlabCiphertext = Buffer.from('gitlab-source-ciphertext');
    const createdAt = new Date('2026-08-01T10:00:00.000Z');
    const updatedAt = new Date('2026-08-02T11:00:00.000Z');
    const sources: DbProjectDbtSource[] = [
        {
            project_dbt_source_uuid: '33333333-3333-4333-8333-333333333333',
            project_uuid: upstreamProjectUuid,
            role: 'extra',
            name: 'finance_models',
            is_primary: false,
            precedence: 2,
            dbt_connection_type: DbtProjectType.GITHUB,
            dbt_connection: githubCiphertext,
            warehouse_database: 'finance_database',
            warehouse_schema: null,
            created_at: createdAt,
            updated_at: updatedAt,
        },
        {
            project_dbt_source_uuid: '44444444-4444-4444-8444-444444444444',
            project_uuid: upstreamProjectUuid,
            role: 'extra',
            name: 'marketing_models',
            is_primary: false,
            precedence: 5,
            dbt_connection_type: DbtProjectType.GITLAB,
            dbt_connection: gitlabCiphertext,
            warehouse_database: null,
            warehouse_schema: 'marketing_schema',
            created_at: createdAt,
            updated_at: updatedAt,
        },
    ];
    const database = knex({ client: MockClient, dialect: 'pg' });
    const encryptionUtil = {
        encrypt: vi.fn(),
        decrypt: vi.fn(),
    } as unknown as EncryptionUtil;
    const model = new ProjectDbtSourcesModel({
        database: database as unknown as Knex,
        encryptionUtil,
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
        vi.clearAllMocks();
    });

    it('copies raw source configuration with new identities', async () => {
        tracker.on.select(ProjectDbtSourcesTableName).responseOnce(sources);
        tracker.on.insert(ProjectDbtSourcesTableName).responseOnce([]);

        await model.copySources(upstreamProjectUuid, previewProjectUuid);

        expect(tracker.history.select[0].bindings).toEqual([
            upstreamProjectUuid,
            'extra',
        ]);
        expect(tracker.history.insert[0].bindings).toEqual([
            githubCiphertext,
            DbtProjectType.GITHUB,
            false,
            'finance_models',
            2,
            previewProjectUuid,
            'finance_database',
            null,
            gitlabCiphertext,
            DbtProjectType.GITLAB,
            false,
            'marketing_models',
            5,
            previewProjectUuid,
            null,
            'marketing_schema',
        ]);
        expect(tracker.history.insert[0].sql).not.toMatch(
            /project_dbt_source_uuid|created_at|updated_at/,
        );
        expect(encryptionUtil.decrypt).not.toHaveBeenCalled();
        expect(encryptionUtil.encrypt).not.toHaveBeenCalled();
    });
    it.each([
        'getSources',
        'getSourcesForApi',
        'getSourcesWithBindings',
    ] as const)(
        '%s ignores main rows while the flag is off',
        async (method) => {
            const main = { ...sources[0], role: 'main', name: 'main_source' };
            tracker.on
                .select(ProjectDbtSourcesTableName)
                .response((query) =>
                    query.bindings.includes('extra')
                        ? sources
                        : [main, ...sources],
                );
            encryptionUtil.decrypt = vi.fn(() =>
                JSON.stringify({ type: DbtProjectType.NONE }),
            );
            const result = await model[method](upstreamProjectUuid);
            expect(result.map((source) => source.name)).toEqual([
                'finance_models',
                'marketing_models',
            ]);
            expect(tracker.history.select[0].sql).toMatch(/"role" = \$\d+/);
            expect(encryptionUtil.decrypt).toHaveBeenCalledTimes(2);
        },
    );

    it('does not count a main row as an additional source', async () => {
        tracker.on
            .select(ProjectDbtSourcesTableName)
            .response((query) =>
                query.bindings.includes('extra')
                    ? undefined
                    : { ...sources[0], role: 'main' },
            );
        await expect(model.hasSources(upstreamProjectUuid)).resolves.toBe(
            false,
        );
        expect(tracker.history.select[0].sql).toMatch(/"role" = \$\d+/);
    });

    it.each([
        'getSource',
        'getSourceForApi',
        'updateSource',
        'deleteSource',
    ] as const)('%s cannot read or mutate a main source', async (method) => {
        tracker.on
            .select(ProjectDbtSourcesTableName)
            .response((query) =>
                query.bindings.includes('extra')
                    ? undefined
                    : { ...sources[0], role: 'main' },
            );
        const uuid = sources[0].project_dbt_source_uuid;
        const result =
            method === 'updateSource'
                ? model.updateSource(uuid, { name: 'changed' })
                : model[method](uuid);
        await expect(result).rejects.toThrow(NotFoundError);
        expect(tracker.history.update).toHaveLength(0);
        expect(tracker.history.delete).toHaveLength(0);
    });

    it.each(['copySources', 'copySourcesWithConnectionMap'] as const)(
        '%s does not copy a main row',
        async (method) => {
            tracker.on
                .select(ProjectDbtSourcesTableName)
                .response((query) =>
                    query.bindings.includes('extra')
                        ? []
                        : [{ ...sources[0], role: 'main' }],
                );
            if (method === 'copySources')
                await model.copySources(
                    upstreamProjectUuid,
                    previewProjectUuid,
                );
            else
                await model.copySourcesWithConnectionMap(
                    upstreamProjectUuid,
                    previewProjectUuid,
                    new Map(),
                );
            expect(tracker.history.insert).toHaveLength(0);
        },
    );

    it('resets repository fill after a credential edit while the flag is off', async () => {
        const source = sources[0];
        tracker.on.select(ProjectDbtSourcesTableName).response(source);
        tracker.on.update(ProjectDbtSourcesTableName).response([source]);
        const registerSource = vi.spyOn(model.peers, 'registerSource');
        const initialize = vi.spyOn(model.peers, 'initializeProjectNames');
        encryptionUtil.encrypt = vi.fn(() => githubCiphertext);
        await model.updateSource(source.project_dbt_source_uuid, {
            dbtConnection: { type: DbtProjectType.NONE },
        });
        const query = tracker.history.update[0];
        expect(query.sql).toMatch(/"repository_fill_state" = \$\d+/);
        expect(query.sql).toMatch(/"repository_fill_attempted_at" = \$\d+/);
        expect(query.sql).toMatch(/"role" = \$\d+/);
        expect(query.bindings).toEqual(
            expect.arrayContaining(['pending', null, 'extra']),
        );
        expect(registerSource).not.toHaveBeenCalled();
        expect(initialize).not.toHaveBeenCalled();
        registerSource.mockRestore();
        initialize.mockRestore();
    });

    it('uses the frozen scope without a model flag lookup', async () => {
        tracker.on.select(ProjectDbtSourcesTableName).response(sources);
        const ensure = vi
            .spyOn(model.peers, 'ensureRepositories')
            .mockResolvedValue();
        await withPeerDbtSourcesOperation(true, async () => {
            await model.getSources(upstreamProjectUuid);
            await model.getSourcesWithBindings(upstreamProjectUuid);
        });
        expect(ensure).toHaveBeenCalledTimes(2);
        expect(tracker.history.select).toHaveLength(4);
        ensure.mockRestore();
    });

    it.each([
        'getSources',
        'getSourcesForApi',
        'getSourcesWithBindings',
    ] as const)(
        '%s skips terminal ciphertext errors using the state written by fill',
        async (method) => {
            const corruptCiphertext = Buffer.from('corrupt');
            const pending = [
                {
                    ...sources[0],
                    repository_fill_state: 'pending',
                    dbt_repository_uuid: null,
                    warehouse_connection_uuid: null,
                },
                {
                    ...sources[1],
                    dbt_connection: corruptCiphertext,
                    repository_fill_state: 'pending',
                    dbt_repository_uuid: null,
                    warehouse_connection_uuid: null,
                },
            ];
            const healthy = { type: DbtProjectType.NONE };
            encryptionUtil.decrypt = vi.fn((encrypted: Buffer) => {
                if (encrypted.equals(corruptCiphertext))
                    throw new Error('Cannot decrypt');
                return JSON.stringify(healthy);
            });
            let filled = false;
            const current = () =>
                pending.map((row, index) => {
                    const outcome = index === 0 ? 'failed' : 'cannot_decrypt';
                    return {
                        ...row,
                        repository_fill_state: filled ? outcome : 'pending',
                    };
                });
            tracker.on
                .select(ProjectDbtSourcesTableName)
                .response(() => current());
            const ensure = vi
                .spyOn(model.peers, 'ensureRepositories')
                .mockImplementation(async () => {
                    if (!filled) {
                        expect(() =>
                            encryptionUtil.decrypt(corruptCiphertext),
                        ).toThrow();
                        filled = true;
                    }
                });
            const settings = vi
                .spyOn(model.peers, 'getSettings')
                .mockResolvedValue(new Map());
            const resolve = vi.spyOn(model.peers, 'resolveConnection');
            try {
                await withPeerDbtSourcesOperation(true, async () => {
                    const read = async () => {
                        const result = await model[method](upstreamProjectUuid);
                        expect(result[0]).toMatchObject({
                            dbtConnection: healthy,
                            hasCredentialError: false,
                        });
                        expect(result[1]).toMatchObject({
                            name: sources[1].name,
                            dbtConnection: null,
                            hasCredentialError: true,
                        });
                    };
                    await read();
                    await read();
                });
                expect(
                    vi
                        .mocked(encryptionUtil.decrypt)
                        .mock.calls.filter(([ciphertext]) =>
                            ciphertext.equals(corruptCiphertext),
                        ),
                ).toHaveLength(1);
                expect(resolve).not.toHaveBeenCalled();
            } finally {
                ensure.mockRestore();
                settings.mockRestore();
                resolve.mockRestore();
            }
        },
    );

    it('does not decrypt a terminal corrupt row for API editing while enabled', async () => {
        const corrupt = {
            ...sources[0],
            repository_fill_state: 'cannot_decrypt',
        };
        tracker.on.select(ProjectDbtSourcesTableName).responseOnce(corrupt);
        tracker.on.select(ProjectDbtSourcesTableName).responseOnce([corrupt]);
        const ensure = vi
            .spyOn(model.peers, 'ensureRepositories')
            .mockResolvedValue();
        try {
            await withPeerDbtSourcesOperation(true, async () => {
                await expect(
                    model.getSourceForApi(corrupt.project_dbt_source_uuid),
                ).resolves.toMatchObject({
                    name: corrupt.name,
                    dbtConnection: null,
                    hasCredentialError: true,
                });
            });
            expect(encryptionUtil.decrypt).not.toHaveBeenCalled();
        } finally {
            ensure.mockRestore();
        }
    });

    it.each([true, false])(
        'honors the explicit model override %s',
        async (enabled) => {
            const explicit = new ProjectDbtSourcesModel({
                database,
                encryptionUtil,
                peerDbtSourcesEnabled: enabled,
            });
            tracker.on.select(ProjectDbtSourcesTableName).response(sources);
            const ensure = vi
                .spyOn(explicit.peers, 'ensureRepositories')
                .mockResolvedValue();
            try {
                await withPeerDbtSourcesOperation(!enabled, () =>
                    explicit.getSources(upstreamProjectUuid),
                );
                expect(ensure).toHaveBeenCalledTimes(enabled ? 1 : 0);
            } finally {
                ensure.mockRestore();
            }
        },
    );
    it.each(['cannot_parse', 'failed'] as const)(
        'keeps decoded local credentials after a %s repository fill',
        async (state) => {
            const local = {
                type: DbtProjectType.GITHUB,
                repository: 'unsupported-repository-identity',
                branch: 'main',
                project_sub_path: '/',
            };
            const row = {
                ...sources[0],
                repository_fill_state: state,
                dbt_repository_uuid: null,
            };
            tracker.on.select(ProjectDbtSourcesTableName).response([row]);
            encryptionUtil.decrypt = vi.fn(() => JSON.stringify(local));
            const ensure = vi
                .spyOn(model.peers, 'ensureRepositories')
                .mockResolvedValue();
            try {
                await withPeerDbtSourcesOperation(true, async () => {
                    await expect(
                        model.getSources(upstreamProjectUuid),
                    ).resolves.toMatchObject([
                        {
                            dbtConnection: local,
                            hasCredentialError: false,
                        },
                    ]);
                });
            } finally {
                ensure.mockRestore();
            }
        },
    );
});
