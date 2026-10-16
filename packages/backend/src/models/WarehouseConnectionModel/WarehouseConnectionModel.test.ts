import { WarehouseTypes, type CreateTrinoCredentials } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { type EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { OrganizationWarehouseCredentialsModel } from '../OrganizationWarehouseCredentialsModel';
import { WarehouseConnectionModel } from './WarehouseConnectionModel';

const credentials: CreateTrinoCredentials = {
    type: WarehouseTypes.TRINO,
    host: 'localhost',
    port: 8080,
    user: 'user',
    password: 'password',
    dbname: 'database',
    schema: 'public',
    http_scheme: 'http',
};
const project = {
    projectUuid: 'project',
    organizationUuid: 'org',
    originalWarehouseType: WarehouseTypes.POSTGRES,
    connectionMode: 'multi' as const,
};

describe('updating an extra connection warehouse type', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const tracker = getTracker();
    const encryptionUtil = {
        encrypt: (value: string) => Buffer.from(value),
        decrypt: (value: Buffer) => value.toString(),
    } as EncryptionUtil;
    const model = new WarehouseConnectionModel({
        database,
        encryptionUtil,
        organizationWarehouseCredentialsModel:
            new OrganizationWarehouseCredentialsModel({
                database,
                encryptionUtil,
            }),
    });
    beforeEach(() => {
        tracker.reset();
        tracker.on.select('warehouse_connections').response([
            {
                is_original: false,
                warehouse_type: WarehouseTypes.POSTGRES,
                encrypted_credentials: null,
                organization_warehouse_credentials_uuid: null,
            },
        ]);
        tracker.on.update('warehouse_connections').response(1);
    });
    afterAll(async () => database.destroy());

    it('persists the new type alongside project credentials', async () => {
        await model.updateExtraCredentials(project, 'connection', {
            kind: 'project',
            credentials,
        });
        const update = tracker.history.update[0];
        expect(update.sql).toContain('"warehouse_type" =');
        expect(update.bindings).toContain(WarehouseTypes.TRINO);
        const saved = update.bindings.find(Buffer.isBuffer);
        expect(saved).toBeDefined();
        expect(JSON.parse(saved!.toString())).toMatchObject(credentials);
    });
    it('persists the type of organization credentials', async () => {
        tracker.on.select('organization_warehouse_credentials').response([
            {
                warehouse_type: WarehouseTypes.TRINO,
                organization_uuid: project.organizationUuid,
            },
        ]);
        await model.updateExtraCredentials(project, 'connection', {
            kind: 'organization',
            organizationWarehouseCredentialsUuid: 'organization-credentials',
        });
        expect(tracker.history.update[0].bindings).toContain(
            WarehouseTypes.TRINO,
        );
    });
    it('refuses organization credentials from another organization', async () => {
        tracker.on.select('organization_warehouse_credentials').response([
            {
                warehouse_type: WarehouseTypes.TRINO,
                organization_uuid: 'other-org',
            },
        ]);
        await expect(
            model.updateExtraCredentials(project, 'connection', {
                kind: 'organization',
                organizationWarehouseCredentialsUuid:
                    'organization-credentials',
            }),
        ).rejects.toThrow('Organization warehouse credentials not found');
        expect(tracker.history.update).toHaveLength(0);
    });
});
