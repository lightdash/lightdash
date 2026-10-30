import { WarehouseTypes, type CreateTrinoCredentials } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { type EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { RefreshTokenSourceChangedError } from '../RefreshTokenRotation/RefreshTokenRotation';
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

    it('refuses a type change from project credentials under the row lock', async () => {
        await expect(
            model.updateExtraCredentials(project, 'connection', {
                kind: 'project',
                credentials,
            }),
        ).rejects.toThrow(
            "A connection's warehouse type cannot be changed. Add a new connection instead.",
        );
        expect(tracker.history.update).toHaveLength(0);
    });
    it('updates credentials without writing the warehouse type', async () => {
        await model.updateExtraCredentials(project, 'connection', {
            kind: 'project',
            credentials: { ...credentials, type: WarehouseTypes.POSTGRES },
        });
        const update = tracker.history.update[0];
        expect(update.sql).not.toContain('"warehouse_type" =');
        const saved = update.bindings.find(Buffer.isBuffer);
        expect(saved).toBeDefined();
        expect(JSON.parse(saved!.toString())).toMatchObject({
            type: WarehouseTypes.POSTGRES,
        });
    });

    it('rejects a retired organization link even when inline credentials exist', async () => {
        tracker.reset();
        tracker.on.select('warehouse_connections').response({
            is_original: false,
            organization_warehouse_credentials_uuid: 'retired-credential',
            encrypted_credentials: Buffer.from(JSON.stringify(credentials)),
        });

        await expect(
            model.getOwnCredentials(project, 'connection'),
        ).rejects.toBeInstanceOf(RefreshTokenSourceChangedError);
    });

    it('clears a retired link and invalidates credentials when replaced with the same inline credentials', async () => {
        const replacement = {
            ...credentials,
            type: WarehouseTypes.POSTGRES as const,
        };
        tracker.reset();
        tracker.on.select('warehouse_connections').response({
            is_original: false,
            warehouse_type: replacement.type,
            organization_warehouse_credentials_uuid: 'retired-credential',
            encrypted_credentials: Buffer.from(JSON.stringify(replacement)),
        });
        tracker.on.update('warehouse_connections').response(1);

        await model.updateExtraCredentials(project, 'connection', {
            kind: 'project',
            credentials: replacement,
        });

        const update = tracker.history.update[0];
        expect(update.sql).toContain(
            '"organization_warehouse_credentials_uuid" =',
        );
        expect(update.bindings).toContain(null);
        expect(update.sql).toContain(
            '"connection_credential_generation" = "connection_credential_generation" + 1',
        );
    });
});
