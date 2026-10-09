import {
    DbtProjectType,
    DefaultSupportedDbtVersion,
    ProjectType,
    RedshiftAuthenticationType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';
import { OrganizationWarehouseCredentialsModel } from './OrganizationWarehouseCredentialsModel';
import { ProjectModel } from './ProjectModel/ProjectModel';
import { WarehouseConnectionIdentityModel } from './WarehouseConnectionIdentityModel/WarehouseConnectionIdentityModel';
import { WarehouseConnectionModel } from './WarehouseConnectionModel/WarehouseConnectionModel';

const database = knex({ client: MockClient, dialect: 'pg' });
const encryptionUtil = new EncryptionUtil({
    lightdashConfig: lightdashConfigMock,
});
const project = {
    projectUuid: 'project',
    organizationUuid: 'org',
    connectionMode: 'multi' as const,
    originalWarehouseType: WarehouseTypes.POSTGRES,
};
const keyPairOwners: Record<string, string | null> = {
    owned: 'org',
    'null-owner': null,
    'other-org': 'other',
};
const credentials = {
    type: WarehouseTypes.POSTGRES as const,
    host: 'db',
    port: 5432,
    user: 'user',
    password: 'password',
    dbname: 'db',
    schema: 'public',
    useSshTunnel: true,
    sshTunnelPublicKey: 'PUBLIC',
    sshTunnelPrivateKey: 'COPY',
};
const projectData = {
    name: 'project',
    type: ProjectType.PREVIEW,
    dbtConnection: { type: DbtProjectType.NONE as const },
    dbtVersion: DefaultSupportedDbtVersion,
    warehouseConnection: credentials,
};
const tracker = getTracker();
const projectModel = new ProjectModel({
    database,
    encryptionUtil,
    lightdashConfig: lightdashConfigMock,
});
const extraModel = new WarehouseConnectionModel({
    database,
    encryptionUtil,
    organizationWarehouseCredentialsModel:
        {} as OrganizationWarehouseCredentialsModel,
});

beforeEach(() => {
    tracker.on
        .any(({ sql }) => sql.includes('pg_advisory_xact_lock'))
        .response([]);
    tracker.on
        .select(({ sql }) => sql.includes('organizations'))
        .response([{ organization_id: 1, organization_uuid: 'org' }]);
});
afterEach(() => {
    tracker.reset();
    vi.restoreAllMocks();
});

const decryptWrite = (method: 'insert' | 'update', table: string) => {
    const query = tracker.history[method].find(({ sql }) =>
        sql.includes(`"${table}"`),
    );
    expect(query).toBeDefined();
    const blob = query!.bindings.find((value) => Buffer.isBuffer(value));
    expect(Buffer.isBuffer(blob)).toBe(true);
    try {
        return JSON.parse(
            encryptionUtil.decrypt(blob as Buffer),
        ) as CreateWarehouseCredentials;
    } catch (error) {
        throw new Error('Expected decryptable credentials', { cause: error });
    }
};

for (const type of [
    WarehouseTypes.POSTGRES,
    WarehouseTypes.REDSHIFT,
] as const) {
    for (const writer of [
        'project update',
        'project create',
        'extra create',
        'extra update',
        'preview copy',
    ] as const) {
        describe(`${type} ${writer}`, () => {
            it.each(['owned', 'missing', 'null-owner', 'other-org'])(
                'applies %s ownership to stored credentials',
                async (ownership) => {
                    const input =
                        type === WarehouseTypes.POSTGRES
                            ? credentials
                            : {
                                  ...credentials,
                                  type,
                                  authenticationType:
                                      RedshiftAuthenticationType.PASSWORD,
                              };
                    const before = structuredClone(input);
                    tracker.on
                        .select(({ sql }) => sql.includes('ssh_key_pairs'))
                        .response(
                            ownership === 'missing'
                                ? []
                                : [
                                      {
                                          public_key: 'PUBLIC',
                                          private_key:
                                              encryptionUtil.encrypt(
                                                  'ORG-PRIVATE',
                                              ),
                                          organization_uuid:
                                              keyPairOwners[ownership],
                                      },
                                  ],
                        );
                    let stored: CreateWarehouseCredentials;
                    if (
                        writer === 'project update' ||
                        writer === 'project create'
                    ) {
                        vi.spyOn(
                            projectModel,
                            'getWarehouseCredentialsForProject',
                        ).mockResolvedValue(input);
                        tracker.on
                            .update('"projects"')
                            .response([{ project_id: 1, organization_id: 1 }]);
                        tracker.on.select('"projects"').response([]);
                        tracker.on
                            .insert('"projects"')
                            .response([
                                { project_id: 1, project_uuid: 'project' },
                            ]);
                        tracker.on
                            .select('"warehouse_connections"')
                            .response([]);
                        tracker.on
                            .insert('"warehouse_credentials"')
                            .response([]);
                        if (writer === 'project create')
                            await projectModel.create('user', 'org', {
                                ...projectData,
                                warehouseConnection: input,
                            });
                        else
                            await projectModel.update(
                                'project',
                                { ...projectData, warehouseConnection: input },
                                null,
                            );
                        stored = decryptWrite(
                            'insert',
                            'warehouse_credentials',
                        );
                    } else if (
                        writer === 'extra create' ||
                        writer === 'extra update'
                    ) {
                        tracker.on.insert('"warehouse_connections"').response([
                            {
                                warehouse_connection_uuid: 'extra',
                                warehouse_type: type,
                            },
                        ]);
                        tracker.on
                            .update('"warehouse_connections"')
                            .response(1);
                        if (writer === 'extra create')
                            await extraModel.createExtra(project, {
                                name: 'extra',
                                warehouseType: type,
                                source: { kind: 'project', credentials: input },
                                listAllDatabases: false,
                                additionalDatabases: [],
                                createdByUserUuid: 'user',
                            });
                        else
                            await extraModel.updateExtraCredentials(
                                project,
                                'extra',
                                { kind: 'project', credentials: input },
                            );
                        stored = decryptWrite(
                            writer === 'extra create' ? 'insert' : 'update',
                            'warehouse_connections',
                        );
                    } else {
                        tracker.on
                            .select(
                                ({ sql }) =>
                                    sql.includes('"projects"') &&
                                    sql.includes(' in '),
                            )
                            .response([
                                { project_uuid: 'project', organization_id: 1 },
                                { project_uuid: 'preview', organization_id: 1 },
                            ]);
                        tracker.on
                            .select('"projects"')
                            .response([
                                { project_uuid: 'preview', organization_id: 1 },
                            ]);
                        tracker.on
                            .select(
                                ({ sql, bindings }) =>
                                    sql.includes('"warehouse_connections"') &&
                                    bindings.includes('preview'),
                            )
                            .response([]);
                        tracker.on.select('"warehouse_connections"').response([
                            {
                                warehouse_connection_uuid: 'extra',
                                project_uuid: 'project',
                                is_original: false,
                                name: 'extra',
                                warehouse_type: type,
                                encrypted_credentials: encryptionUtil.encrypt(
                                    JSON.stringify(input),
                                ),
                                organization_warehouse_credentials_uuid: null,
                                list_all_databases: false,
                                additional_databases: [],
                                created_by_user_uuid: 'user',
                            },
                        ]);
                        tracker.on
                            .insert('"warehouse_connections"')
                            .response([
                                { warehouse_connection_uuid: 'copied-extra' },
                            ]);
                        tracker.on
                            .any(({ sql }) => sql.startsWith('UPDATE projects'))
                            .response([]);
                        await new WarehouseConnectionIdentityModel({
                            database,
                        }).copyConnectionsToPreview(
                            'project',
                            'preview',
                            encryptionUtil,
                        );
                        stored = decryptWrite(
                            'insert',
                            'warehouse_connections',
                        );
                    }
                    if (ownership === 'owned')
                        expect(stored).not.toHaveProperty(
                            'sshTunnelPrivateKey',
                        );
                    else
                        expect(stored).toHaveProperty(
                            'sshTunnelPrivateKey',
                            'COPY',
                        );
                    expect(input).toEqual(before);
                },
            );
        });
    }
}

it.each([true, false])(
    'merges a legacy copy only before validation (%s)',
    (restoreSshTunnelPrivateKey) => {
        expect(
            ProjectModel.mergeMissingWarehouseSecrets(
                { ...credentials, sshTunnelPrivateKey: undefined },
                credentials,
                { restoreSshTunnelPrivateKey },
            ).sshTunnelPrivateKey,
        ).toBe(restoreSshTunnelPrivateKey ? 'COPY' : undefined);
    },
);
it('does not restore a private key when the public key changes', () => {
    expect(
        ProjectModel.mergeMissingWarehouseSecrets(
            {
                ...credentials,
                sshTunnelPublicKey: 'NEW',
                sshTunnelPrivateKey: undefined,
            },
            credentials,
        ).sshTunnelPrivateKey,
    ).toBeUndefined();
});

describe('organisation SSH credential storage', () => {
    it.each(['owned', 'missing', 'null-owner', 'other-org'])(
        'applies %s ownership to create and update',
        async (ownership) => {
            const model = new OrganizationWarehouseCredentialsModel({
                database,
                encryptionUtil,
            });
            const existing = {
                organization_warehouse_credentials_uuid: 'shared',
                organization_uuid: 'org',
                warehouse_type: WarehouseTypes.POSTGRES,
                warehouse_connection: encryptionUtil.encrypt(
                    JSON.stringify(credentials),
                ),
            };
            tracker.on.select('"ssh_key_pairs"').response(
                ownership === 'missing'
                    ? []
                    : [
                          {
                              public_key: 'PUBLIC',
                              private_key:
                                  encryptionUtil.encrypt('ORG-PRIVATE'),
                              organization_uuid: keyPairOwners[ownership],
                          },
                      ],
            );
            tracker.on
                .select('"organization_warehouse_credentials"')
                .response([existing]);
            tracker.on
                .insert('"organization_warehouse_credentials"')
                .response([existing]);
            tracker.on
                .update('"organization_warehouse_credentials"')
                .response(1);
            await model.create('org', { name: 'shared', credentials }, 'user');
            await model.update('shared', { credentials });
            for (const method of ['insert', 'update'] as const) {
                const stored = decryptWrite(
                    method,
                    'organization_warehouse_credentials',
                );
                if (ownership === 'owned')
                    expect(stored).not.toHaveProperty('sshTunnelPrivateKey');
                else
                    expect(stored).toHaveProperty(
                        'sshTunnelPrivateKey',
                        'COPY',
                    );
            }
        },
    );
});
