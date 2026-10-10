import {
    AthenaAuthenticationType,
    BigqueryAuthenticationType,
    DatabricksAuthenticationType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
} from '@lightdash/common';
import { isSupportedAiServiceAccountSlot } from './aiServiceAccountCredentialResolvers';

describe('isSupportedAiServiceAccountSlot', () => {
    test.each([
        [WarehouseTypes.POSTGRES, 'password'],
        [WarehouseTypes.ATHENA, AthenaAuthenticationType.ACCESS_KEY],
        [WarehouseTypes.BIGQUERY, BigqueryAuthenticationType.PRIVATE_KEY],
        [WarehouseTypes.SNOWFLAKE, SnowflakeAuthenticationType.PRIVATE_KEY],
        [WarehouseTypes.DATABRICKS, DatabricksAuthenticationType.OAUTH_M2M],
    ])('supports %s with %s', (warehouseType, method) => {
        expect(isSupportedAiServiceAccountSlot(warehouseType, method)).toBe(
            true,
        );
    });

    test.each([
        [WarehouseTypes.BIGQUERY, DatabricksAuthenticationType.OAUTH_M2M],
        [WarehouseTypes.SNOWFLAKE, DatabricksAuthenticationType.OAUTH_M2M],
        [WarehouseTypes.DATABRICKS, BigqueryAuthenticationType.PRIVATE_KEY],
        [WarehouseTypes.POSTGRES, BigqueryAuthenticationType.PRIVATE_KEY],
        [WarehouseTypes.POSTGRES, DatabricksAuthenticationType.OAUTH_M2M],
        [WarehouseTypes.ATHENA, AthenaAuthenticationType.IAM_ROLE],
        [WarehouseTypes.ATHENA, AthenaAuthenticationType.WEB_IDENTITY],
    ])('rejects %s with %s', (warehouseType, method) => {
        expect(isSupportedAiServiceAccountSlot(warehouseType, method)).toBe(
            false,
        );
    });
});
