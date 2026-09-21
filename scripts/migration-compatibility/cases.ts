export const BASELINE_APP_REF = 'e6cc68e732d26b8fc64b5631748b90918069cfae';
export const COMPATIBILITY_APP_REF = 'a1dd8b0bad5585a2bb874d34bdb064d718007158';
export const MIGRATION_REF = '4e4660f2c583613d08e3f6f085234f1aa73cedae';

export const EXPAND_CONNECTIONS_MIGRATION =
    '20260917140000_expand_warehouse_credentials_into_connections.ts';
export const CONTRACT_CONNECTIONS_MIGRATION =
    '20260917170000_contract_warehouse_credentials_connections.ts';
export const ARTIFACTS_MIGRATION =
    '20260918120000_scope_project_artifacts_to_connections.ts';

type FindingOneOutcome =
    | {
          kind: 'postgres-error';
          code: '42702';
          column: 'organization_warehouse_credentials_uuid';
      }
    | {
          kind: 'value';
          credentialMarker: 'project-authority';
      };

type ArtifactExpectation = {
    legacy: 'old-latest';
    scoped: 'new-before-old' | 'old-latest';
    observed: 'new-before-old' | 'old-latest';
};

type FindingOneCase = {
    name: 'ambiguous-column-broken' | 'ambiguous-column-compatible';
    probe: 'finding-one';
    appRef: string;
    through: typeof EXPAND_CONNECTIONS_MIGRATION;
    expected: FindingOneOutcome;
};

type ArtifactCase = {
    name:
        | 'catalog-cache-stale'
        | 'catalog-cache-compatible'
        | 'merged-manifest-stale'
        | 'merged-manifest-compatible';
    probe: 'catalog-cache' | 'merged-manifest';
    appRef: string;
    through: typeof ARTIFACTS_MIGRATION;
    expected: ArtifactExpectation;
};

type TwoLiveConnectionsCase = {
    name:
        | 'two-live-connections-wrong-warehouse'
        | 'two-live-connections-refused';
    probe: 'two-live-connections';
    appRef: string;
    through: typeof CONTRACT_CONNECTIONS_MIGRATION;
    expected: {
        available: [
            {
                connectionUuid: '30000000-0000-4000-8000-000000000001';
                credentialMarker: 'connection-a';
            },
            {
                connectionUuid: '30000000-0000-4000-8000-000000000002';
                credentialMarker: 'connection-b';
            },
        ];
        contentBinding: '30000000-0000-4000-8000-000000000002';
        outcome:
            | {
                  kind: 'selected';
                  connectionUuid: '30000000-0000-4000-8000-000000000001';
                  credentialMarker: 'connection-a';
              }
            | {
                  kind: 'refused';
                  name: 'UnexpectedServerError';
                  message: 'Project 10000000-0000-4000-8000-000000000003 has more than one active warehouse connection on this instance.';
              };
    };
};

export type CompatibilityCase =
    | FindingOneCase
    | ArtifactCase
    | TwoLiveConnectionsCase;

export const compatibilityCases: Record<
    CompatibilityCase['name'],
    CompatibilityCase
> = {
    'ambiguous-column-broken': {
        name: 'ambiguous-column-broken',
        probe: 'finding-one',
        appRef: BASELINE_APP_REF,
        through: EXPAND_CONNECTIONS_MIGRATION,
        expected: {
            kind: 'postgres-error',
            code: '42702',
            column: 'organization_warehouse_credentials_uuid',
        },
    },
    'ambiguous-column-compatible': {
        name: 'ambiguous-column-compatible',
        probe: 'finding-one',
        appRef: 'candidate',
        through: EXPAND_CONNECTIONS_MIGRATION,
        expected: {
            kind: 'value',
            credentialMarker: 'project-authority',
        },
    },
    'catalog-cache-stale': {
        name: 'catalog-cache-stale',
        probe: 'catalog-cache',
        appRef: BASELINE_APP_REF,
        through: ARTIFACTS_MIGRATION,
        expected: {
            legacy: 'old-latest',
            scoped: 'new-before-old',
            observed: 'new-before-old',
        },
    },
    'catalog-cache-compatible': {
        name: 'catalog-cache-compatible',
        probe: 'catalog-cache',
        appRef: 'candidate',
        through: ARTIFACTS_MIGRATION,
        expected: {
            legacy: 'old-latest',
            scoped: 'old-latest',
            observed: 'old-latest',
        },
    },
    'merged-manifest-stale': {
        name: 'merged-manifest-stale',
        probe: 'merged-manifest',
        appRef: BASELINE_APP_REF,
        through: ARTIFACTS_MIGRATION,
        expected: {
            legacy: 'old-latest',
            scoped: 'new-before-old',
            observed: 'new-before-old',
        },
    },
    'merged-manifest-compatible': {
        name: 'merged-manifest-compatible',
        probe: 'merged-manifest',
        appRef: 'candidate',
        through: ARTIFACTS_MIGRATION,
        expected: {
            legacy: 'old-latest',
            scoped: 'old-latest',
            observed: 'old-latest',
        },
    },
    'two-live-connections-wrong-warehouse': {
        name: 'two-live-connections-wrong-warehouse',
        probe: 'two-live-connections',
        appRef: COMPATIBILITY_APP_REF,
        through: CONTRACT_CONNECTIONS_MIGRATION,
        expected: {
            available: [
                {
                    connectionUuid: '30000000-0000-4000-8000-000000000001',
                    credentialMarker: 'connection-a',
                },
                {
                    connectionUuid: '30000000-0000-4000-8000-000000000002',
                    credentialMarker: 'connection-b',
                },
            ],
            contentBinding: '30000000-0000-4000-8000-000000000002',
            outcome: {
                kind: 'selected',
                connectionUuid: '30000000-0000-4000-8000-000000000001',
                credentialMarker: 'connection-a',
            },
        },
    },
    'two-live-connections-refused': {
        name: 'two-live-connections-refused',
        probe: 'two-live-connections',
        appRef: 'candidate',
        through: CONTRACT_CONNECTIONS_MIGRATION,
        expected: {
            available: [
                {
                    connectionUuid: '30000000-0000-4000-8000-000000000001',
                    credentialMarker: 'connection-a',
                },
                {
                    connectionUuid: '30000000-0000-4000-8000-000000000002',
                    credentialMarker: 'connection-b',
                },
            ],
            contentBinding: '30000000-0000-4000-8000-000000000002',
            outcome: {
                kind: 'refused',
                name: 'UnexpectedServerError',
                message:
                    'Project 10000000-0000-4000-8000-000000000003 has more than one active warehouse connection on this instance.',
            },
        },
    },
};

export const getCompatibilityCases = (names: string[]): CompatibilityCase[] =>
    names.map((name) => {
        if (!(name in compatibilityCases)) {
            throw new Error(`Unknown compatibility case: ${name}`);
        }
        return compatibilityCases[name as CompatibilityCase['name']];
    });
