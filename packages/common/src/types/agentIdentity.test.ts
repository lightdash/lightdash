import { assertValidBigqueryKeyfile } from '../utils/bigqueryKeyfile';
import {
    AGENT_IDENTITY_SOURCES,
    getWarehouseServiceAuthMethods,
    supportsAiServiceAccount,
} from './agentIdentity';
import { WarehouseTypes } from './projects';

describe('service authentication methods', () => {
    it.each([
        [WarehouseTypes.BIGQUERY, ['private_key']],
        [WarehouseTypes.SNOWFLAKE, ['password', 'private_key']],
        [WarehouseTypes.POSTGRES, ['password']],
        [WarehouseTypes.REDSHIFT, ['password', 'iam']],
        [WarehouseTypes.TRINO, ['password']],
        [WarehouseTypes.CLICKHOUSE, ['password']],
        [WarehouseTypes.DATABRICKS, ['oauth_m2m']],
        [WarehouseTypes.ATHENA, ['access_key', 'iam_role', 'web_identity']],
        [WarehouseTypes.DUCKDB, ['token']],
    ] as const)('%s has only non-personal methods', (type, methods) => {
        expect(getWarehouseServiceAuthMethods(type)).toEqual(methods);
    });
});

describe('identity source map', () => {
    it.each(Object.values(WarehouseTypes))(
        '%s covers both actors and derives slot support',
        (type) => {
            const sources = AGENT_IDENTITY_SOURCES[type];
            expect(Object.keys(sources).sort()).toEqual([
                'person',
                'service_account',
            ]);
            for (const actorSources of Object.values(sources)) {
                expect(actorSources).toContain('marked_person');
                expect(actorSources.includes('agent_sign_in')).toBe(
                    type === WarehouseTypes.SNOWFLAKE,
                );
                expect(actorSources.includes('ai_service_account')).toBe(
                    type === WarehouseTypes.BIGQUERY,
                );
            }
            expect(supportsAiServiceAccount(type)).toBe(
                type === WarehouseTypes.BIGQUERY,
            );
            expect(sources.person).toEqual(sources.service_account);
            expect(sources.person).toHaveLength(
                type === WarehouseTypes.SNOWFLAKE ||
                    type === WarehouseTypes.BIGQUERY
                    ? 2
                    : 1,
            );
        },
    );
});

describe('BigQuery service account key validation', () => {
    it('accepts a service account key', () => {
        expect(() =>
            assertValidBigqueryKeyfile(
                {
                    type: 'service_account',
                    private_key: 'key',
                    client_email: 'agent@example.com',
                },
                { requireType: 'service_account' },
            ),
        ).not.toThrow();
    });
    it.each(['authorized_user', 'external_account'])(
        'rejects %s keys',
        (type) => {
            expect(() =>
                assertValidBigqueryKeyfile(
                    {
                        type,
                        client_id: 'id',
                        client_secret: 'secret',
                        refresh_token: 'refresh',
                    },
                    { requireType: 'service_account' },
                ),
            ).toThrow();
        },
    );
});
