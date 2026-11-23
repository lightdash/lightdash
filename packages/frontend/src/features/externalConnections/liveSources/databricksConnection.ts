import {
    ApiConnectorType,
    DATABRICKS_STATEMENTS_PATH,
    getDatabricksWarehousePath,
    isDatabricksWorkspaceOrigin,
} from '@lightdash/common';
import { type TokenLiveSourceForm } from './tokenLiveSource';

// The HTTP path in a SQL warehouse's Connection details, or the warehouse's page
const WAREHOUSE_PATH = /^\/sql\/(?:1\.0\/)?warehouses\/([A-Za-z0-9]{1,64})\/?$/;
const CANONICAL =
    /^(https:\/\/[^/]+)\/sql\/1\.0\/warehouses\/([A-Za-z0-9]{1,64})$/;

/**
 * A SQL warehouse as one value: its workspace and ID, in the form of the
 * HTTP path Databricks shows in Connection details.
 */
export const normalizeDatabricksWarehouse = (value: string): string => {
    const trimmed = value.trim();
    try {
        const url = new URL(
            /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
        );
        const match = WAREHOUSE_PATH.exec(url.pathname);
        return match
            ? `https://${url.host.toLowerCase()}/sql/1.0/warehouses/${match[1]}`
            : trimmed;
    } catch {
        return trimmed;
    }
};

const parseWarehouse = (value: string) => {
    const match = CANONICAL.exec(value);
    return match ? { origin: match[1], warehouseId: match[2] } : null;
};

export const DATABRICKS_TOKEN_FORM = {
    origin: 'https://<your workspace>.cloud.databricks.com',
    getOrigin: (warehouse) => parseWarehouse(warehouse)?.origin ?? '',
    account: {
        label: 'SQL warehouse',
        description:
            'Its URL, or the server hostname and HTTP path from Connection details',
        placeholder:
            'https://dbc-1a2b3c4d-5e6f.cloud.databricks.com/sql/1.0/warehouses/1a2b3c4d5e6f7a8b',
        invalidMessage:
            'Paste the URL of a SQL warehouse in a Databricks workspace',
        normalize: normalizeDatabricksWarehouse,
        isValid: (value) => {
            const parsed = parseWarehouse(value);
            return (
                parsed !== null && isDatabricksWorkspaceOrigin(parsed.origin)
            );
        },
    },
    tokenLabel: 'Access token',
    toApiSource: (warehouse) => ({
        connector: ApiConnectorType.DATABRICKS,
        warehouseId: parseWarehouse(warehouse)?.warehouseId ?? '',
    }),
    getAccountId: ({ apiSource, origin }) =>
        apiSource?.connector === ApiConnectorType.DATABRICKS
            ? `${origin}/sql/1.0/warehouses/${apiSource.warehouseId}`
            : '',
    getAccess: (warehouse) => ({
        allowedMethods: ['POST', 'GET'],
        allowedPathPrefixes: [
            DATABRICKS_STATEMENTS_PATH,
            getDatabricksWarehousePath(
                parseWarehouse(warehouse)?.warehouseId ?? '',
            ),
        ],
        allowedContentTypes: ['application/json'],
    }),
    getTestRequest: (warehouse) => ({
        method: 'GET',
        path: getDatabricksWarehousePath(
            parseWarehouse(warehouse)?.warehouseId ?? '',
        ),
        query: {},
    }),
} satisfies TokenLiveSourceForm;
