import { ApiConnectorType, type ExternalConnection } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    DATABRICKS_TOKEN_FORM,
    normalizeDatabricksWarehouse,
} from './databricksConnection';
import {
    toTokenLiveSourceCreatePayload,
    toTokenLiveSourceUpdatePayload,
} from './tokenLiveSource';

const WAREHOUSE =
    'https://dbc-1a2b3c4d-5e6f.cloud.databricks.com/sql/1.0/warehouses/1a2b3c4d5e6f7a8b';

const values = {
    name: ' Databricks ',
    accountId: ` ${WAREHOUSE} `,
    token: ' dapi123 ',
};

describe('databricksConnection', () => {
    it.each([
        WAREHOUSE,
        'dbc-1a2b3c4d-5e6f.cloud.databricks.com/sql/1.0/warehouses/1a2b3c4d5e6f7a8b',
        'https://DBC-1a2b3c4d-5e6f.cloud.databricks.com/sql/warehouses/1a2b3c4d5e6f7a8b/',
        'https://dbc-1a2b3c4d-5e6f.cloud.databricks.com/sql/warehouses/1a2b3c4d5e6f7a8b?o=123',
    ])('reads the warehouse from %s', (value) => {
        expect(normalizeDatabricksWarehouse(value)).toBe(WAREHOUSE);
        expect(DATABRICKS_TOKEN_FORM.account.isValid(WAREHOUSE)).toBe(true);
    });

    it('refuses a host that is not a Databricks workspace', () => {
        const { normalize, isValid } = DATABRICKS_TOKEN_FORM.account;
        expect(
            isValid(
                normalize('https://evil.example.com/sql/1.0/warehouses/abc'),
            ),
        ).toBe(false);
        expect(isValid(normalize('1a2b3c4d5e6f7a8b'))).toBe(false);
        expect(isValid('')).toBe(false);
    });

    it('creates a token source on the workspace host', () => {
        expect(
            toTokenLiveSourceCreatePayload(DATABRICKS_TOKEN_FORM, values),
        ).toMatchObject({
            name: 'Databricks',
            type: 'bearer_token',
            origin: 'https://dbc-1a2b3c4d-5e6f.cloud.databricks.com',
            secret: 'dapi123',
            apiSource: {
                connector: ApiConnectorType.DATABRICKS,
                warehouseId: '1a2b3c4d5e6f7a8b',
            },
            allowedMethods: ['POST', 'GET'],
            allowedPathPrefixes: [
                '/api/2.0/sql/statements',
                '/api/2.0/sql/warehouses/1a2b3c4d5e6f7a8b',
            ],
        });
    });

    it('moves the source when the warehouse changes, keeping a blank token', () => {
        const update = toTokenLiveSourceUpdatePayload(DATABRICKS_TOKEN_FORM, {
            ...values,
            token: ' ',
        });
        expect(update).toMatchObject({
            origin: 'https://dbc-1a2b3c4d-5e6f.cloud.databricks.com',
            apiSource: { warehouseId: '1a2b3c4d5e6f7a8b' },
        });
        expect(update).not.toHaveProperty('secret');
    });

    it('shows a saved source as its warehouse URL', () => {
        expect(
            DATABRICKS_TOKEN_FORM.getAccountId({
                origin: 'https://dbc-1a2b3c4d-5e6f.cloud.databricks.com',
                apiSource: {
                    connector: ApiConnectorType.DATABRICKS,
                    warehouseId: '1a2b3c4d5e6f7a8b',
                },
            } as ExternalConnection),
        ).toBe(WAREHOUSE);
    });

    it('tests by reading the warehouse', () => {
        expect(DATABRICKS_TOKEN_FORM.getTestRequest(WAREHOUSE)).toEqual({
            method: 'GET',
            path: '/api/2.0/sql/warehouses/1a2b3c4d5e6f7a8b',
            query: {},
        });
    });
});
