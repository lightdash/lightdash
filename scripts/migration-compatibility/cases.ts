export const BASELINE_APP_REF = 'e6cc68e732d26b8fc64b5631748b90918069cfae';
export const C1_BROKEN_APP_REF = 'a1dd8b0bad5585a2bb874d34bdb064d718007158';
export const C1_COMPATIBLE_APP_REF = 'ea54371a946a675f812fe07fca9270ff1da81eba';
export const MIGRATION_REF = '4e4660f2c583613d08e3f6f085234f1aa73cedae';

export const EXPAND_CONNECTIONS_MIGRATION =
    '20260917140000_expand_warehouse_credentials_into_connections.ts';
export const CONTRACT_CONNECTIONS_MIGRATION =
    '20260917170000_contract_warehouse_credentials_connections.ts';
export const ARTIFACTS_MIGRATION =
    '20260918120000_scope_project_artifacts_to_connections.ts';

export type CompatibilityPair =
    | 'ambiguous-column'
    | 'catalog-cache'
    | 'merged-manifest'
    | 'saved-sql-connection';

type PairedCase = {
    pair: CompatibilityPair;
    role: 'broken-control' | 'compatible';
};

type SafetyInvariantCase = {
    pair: null;
    role: 'safety-invariant';
};

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

type FindingOneCase = PairedCase & {
    name: 'ambiguous-column-broken' | 'ambiguous-column-compatible';
    probe: 'finding-one';
    appRef: string;
    through: typeof EXPAND_CONNECTIONS_MIGRATION;
    expected: FindingOneOutcome;
};

type ArtifactCase = PairedCase & {
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

type SelectedConnection = {
    kind: 'selected';
    connectionUuid:
        | '30000000-0000-4000-8000-000000000001'
        | '30000000-0000-4000-8000-000000000002';
    credentialMarker: 'connection-a' | 'connection-b';
};

type RefusedConnection = {
    kind: 'refused';
    name: 'UnexpectedServerError';
    message: 'Project 10000000-0000-4000-8000-000000000003 has more than one active warehouse connection on this instance.';
};

type TwoLiveConnectionsCase = (PairedCase | SafetyInvariantCase) & {
    name:
        | 'saved-sql-wrong-warehouse'
        | 'saved-sql-compatible'
        | 'context-free-two-live-refused';
    probe: 'saved-sql-connection' | 'context-free-connection';
    appRef: string;
    through: typeof CONTRACT_CONNECTIONS_MIGRATION | typeof ARTIFACTS_MIGRATION;
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
        storedContentBinding: '30000000-0000-4000-8000-000000000002';
        resolvedContentBinding: null | '30000000-0000-4000-8000-000000000002';
        outcome: SelectedConnection | RefusedConnection;
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
        pair: 'ambiguous-column',
        role: 'broken-control',
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
        pair: 'ambiguous-column',
        role: 'compatible',
        probe: 'finding-one',
        appRef: C1_COMPATIBLE_APP_REF,
        through: EXPAND_CONNECTIONS_MIGRATION,
        expected: {
            kind: 'value',
            credentialMarker: 'project-authority',
        },
    },
    'catalog-cache-stale': {
        name: 'catalog-cache-stale',
        pair: 'catalog-cache',
        role: 'broken-control',
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
        pair: 'catalog-cache',
        role: 'compatible',
        probe: 'catalog-cache',
        appRef: C1_COMPATIBLE_APP_REF,
        through: ARTIFACTS_MIGRATION,
        expected: {
            legacy: 'old-latest',
            scoped: 'old-latest',
            observed: 'old-latest',
        },
    },
    'merged-manifest-stale': {
        name: 'merged-manifest-stale',
        pair: 'merged-manifest',
        role: 'broken-control',
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
        pair: 'merged-manifest',
        role: 'compatible',
        probe: 'merged-manifest',
        appRef: C1_COMPATIBLE_APP_REF,
        through: ARTIFACTS_MIGRATION,
        expected: {
            legacy: 'old-latest',
            scoped: 'old-latest',
            observed: 'old-latest',
        },
    },
    'saved-sql-wrong-warehouse': {
        name: 'saved-sql-wrong-warehouse',
        pair: 'saved-sql-connection',
        role: 'broken-control',
        probe: 'saved-sql-connection',
        appRef: C1_BROKEN_APP_REF,
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
            storedContentBinding: '30000000-0000-4000-8000-000000000002',
            resolvedContentBinding: null,
            outcome: {
                kind: 'selected',
                connectionUuid: '30000000-0000-4000-8000-000000000001',
                credentialMarker: 'connection-a',
            },
        },
    },
    'saved-sql-compatible': {
        name: 'saved-sql-compatible',
        pair: 'saved-sql-connection',
        role: 'compatible',
        probe: 'saved-sql-connection',
        appRef: MIGRATION_REF,
        through: ARTIFACTS_MIGRATION,
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
            storedContentBinding: '30000000-0000-4000-8000-000000000002',
            resolvedContentBinding: '30000000-0000-4000-8000-000000000002',
            outcome: {
                kind: 'selected',
                connectionUuid: '30000000-0000-4000-8000-000000000002',
                credentialMarker: 'connection-b',
            },
        },
    },
    'context-free-two-live-refused': {
        name: 'context-free-two-live-refused',
        pair: null,
        role: 'safety-invariant',
        probe: 'context-free-connection',
        appRef: C1_COMPATIBLE_APP_REF,
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
            storedContentBinding: '30000000-0000-4000-8000-000000000002',
            resolvedContentBinding: null,
            outcome: {
                kind: 'refused',
                name: 'UnexpectedServerError',
                message:
                    'Project 10000000-0000-4000-8000-000000000003 has more than one active warehouse connection on this instance.',
            },
        },
    },
};

export const compatibilityPairs: Record<
    CompatibilityPair,
    {
        broken: CompatibilityCase['name'];
        compatible: CompatibilityCase['name'];
    }
> = {
    'ambiguous-column': {
        broken: 'ambiguous-column-broken',
        compatible: 'ambiguous-column-compatible',
    },
    'catalog-cache': {
        broken: 'catalog-cache-stale',
        compatible: 'catalog-cache-compatible',
    },
    'merged-manifest': {
        broken: 'merged-manifest-stale',
        compatible: 'merged-manifest-compatible',
    },
    'saved-sql-connection': {
        broken: 'saved-sql-wrong-warehouse',
        compatible: 'saved-sql-compatible',
    },
};

export const fullCompatibilityCaseNames = [
    ...Object.values(compatibilityPairs).flatMap(({ broken, compatible }) => [
        broken,
        compatible,
    ]),
    'context-free-two-live-refused',
];

export const getCompatibilityCases = (names: string[]): CompatibilityCase[] =>
    names.map((name) => {
        if (!(name in compatibilityCases)) {
            throw new Error(`Unknown compatibility case: ${name}`);
        }
        return compatibilityCases[name as CompatibilityCase['name']];
    });
