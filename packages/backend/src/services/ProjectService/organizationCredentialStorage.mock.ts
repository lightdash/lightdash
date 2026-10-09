import {
    WarehouseTypes,
    type CreateSnowflakeCredentials,
} from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { OrganizationWarehouseCredentialsModel } from '../../models/OrganizationWarehouseCredentialsModel';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';

export const organizationCredentialStorage = (
    credentials: CreateSnowflakeCredentials,
    organizationUuid: string,
) => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const tracker = getTracker();
    const encryptionUtil = new EncryptionUtil({
        lightdashConfig: lightdashConfigMock,
    });
    let warehouseConnection = encryptionUtil.encrypt(
        JSON.stringify(credentials),
    );
    tracker.on.select('organization_warehouse_credentials').response(() => [
        {
            organization_warehouse_credentials_uuid: 'org-credential-uuid',
            organization_uuid: organizationUuid,
            warehouse_type: WarehouseTypes.SNOWFLAKE,
            warehouse_connection: warehouseConnection,
            name: 'Shared credentials',
        },
    ]);
    tracker.on
        .update('organization_warehouse_credentials')
        .response(({ bindings }) => {
            const encrypted = bindings[0];
            if (!Buffer.isBuffer(encrypted))
                throw new Error('Expected encrypted credentials');
            warehouseConnection = encrypted;
            return 1;
        });
    const model = new OrganizationWarehouseCredentialsModel({
        database,
        encryptionUtil,
    });
    const rotate = vi.spyOn(model, 'rotateRefreshToken');
    return { database, tracker, encryptionUtil, model, rotate };
};
