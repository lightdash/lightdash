import { expectTypeOf } from 'vitest';
import { assertValidBigqueryKeyfile } from '../utils/bigqueryKeyfile';
import {
    AGENT_IDENTITY_SOURCES,
    getAgentIdentityWarehouseTypes,
    getWarehouseServiceAuthMethods,
    isAllowedAgentIdentitySource,
    supportsAiServiceAccount,
    type OrganizationAgentIdentityRule,
    type UpdateOrganizationAgentIdentityRule,
} from './agentIdentity';
import {
    AiAgentMarkerLevel,
    getAiExecutionCredentialUuid,
    type AiExecutionPlan,
} from './aiPrincipal';
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

describe('organization identity rules', () => {
    it('uses source-only updates and includes missing-project metadata in overview rules', () => {
        const update: UpdateOrganizationAgentIdentityRule = {
            source: 'ai_service_account',
        };
        const rule: OrganizationAgentIdentityRule = {
            ...update,
            warehouseType: WarehouseTypes.BIGQUERY,
            projectsMissingAiServiceAccount: [
                { projectUuid: 'project', name: 'Orders' },
            ],
        };
        expectTypeOf<
            keyof UpdateOrganizationAgentIdentityRule
        >().toEqualTypeOf<'source'>();
        expectTypeOf<keyof OrganizationAgentIdentityRule>().toEqualTypeOf<
            'source' | 'warehouseType' | 'projectsMissingAiServiceAccount'
        >();
        expect(rule.projectsMissingAiServiceAccount).toEqual([
            { projectUuid: 'project', name: 'Orders' },
        ]);
    });

    it('lists only enforceable warehouses in source-map order', () => {
        expect(getAgentIdentityWarehouseTypes()).toEqual([
            WarehouseTypes.SNOWFLAKE,
            WarehouseTypes.BIGQUERY,
        ]);
    });

    it.each(Object.values(WarehouseTypes))(
        '%s validates each source',
        (type) => {
            expect(isAllowedAgentIdentitySource(type, 'marked_person')).toBe(
                true,
            );
            expect(isAllowedAgentIdentitySource(type, 'agent_sign_in')).toBe(
                type === WarehouseTypes.SNOWFLAKE,
            );
            expect(
                isAllowedAgentIdentitySource(type, 'ai_service_account'),
            ).toBe(type === WarehouseTypes.BIGQUERY);
        },
    );

    it('requires every actor to allow a source, while listing any enforceable identity', () => {
        const original =
            AGENT_IDENTITY_SOURCES[WarehouseTypes.SNOWFLAKE].service_account;
        try {
            AGENT_IDENTITY_SOURCES[WarehouseTypes.SNOWFLAKE].service_account = [
                'marked_person',
            ];
            expect(
                isAllowedAgentIdentitySource(
                    WarehouseTypes.SNOWFLAKE,
                    'agent_sign_in',
                ),
            ).toBe(false);
            expect(getAgentIdentityWarehouseTypes()).toContain(
                WarehouseTypes.SNOWFLAKE,
            );
        } finally {
            AGENT_IDENTITY_SOURCES[WarehouseTypes.SNOWFLAKE].service_account =
                original;
        }
    });
});

describe('AI execution credential generation', () => {
    const audit = {
        actorKind: 'person' as const,
        personUuid: 'actor',
        principalRef: 'principal',
        queryTags: {},
        userUuid: 'actor',
    };
    const credentials = {
        type: WarehouseTypes.POSTGRES as const,
        host: 'localhost',
        port: 5432,
        user: 'user',
        password: 'password',
        dbname: 'database',
        schema: 'public',
    };
    it.each([
        [null, null],
        [
            {
                identity: 'marked_person',
                assurances: [
                    {
                        kind: 'agent_marker',
                        level: AiAgentMarkerLevel.IDENTIFY_ONLY,
                    },
                ],
                audit,
            },
            null,
        ],
        [
            {
                identity: 'connected_person',
                identityUuid: 'sign-in-generation',
                credentials,
                assurances: [],
                audit,
            },
            'sign-in-generation',
        ],
        [
            {
                identity: 'ai_service_account',
                identityUuid: 'slot-generation',
                credentialUuid: 'slot-row',
                credentials,
                assurances: [],
                audit,
            },
            'slot-generation',
        ],
    ] satisfies [AiExecutionPlan | null, string | null][])(
        'returns the generation for %j',
        (plan, expected) => {
            expect(getAiExecutionCredentialUuid(plan)).toBe(expected);
        },
    );
});
