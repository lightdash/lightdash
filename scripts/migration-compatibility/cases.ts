export const BASELINE_APP_REF =
    'e6cc68e732d26b8fc64b5631748b90918069cfae';
export const MIGRATION_REF =
    '4e4660f2c583613d08e3f6f085234f1aa73cedae';
export const EXPAND_CONNECTIONS_MIGRATION =
    '20260917140000_expand_warehouse_credentials_into_connections.ts';

export type FindingOneExpectation =
    | {
          kind: 'postgres-error';
          code: '42702';
          column: 'organization_warehouse_credentials_uuid';
      }
    | {
          kind: 'value';
          credentialMarker: 'project-authority';
      };

export type CompatibilityCase = {
    name: 'finding-1-baseline' | 'finding-1-candidate';
    appRef: string | 'candidate';
    migrationRef: string;
    through: string;
    expected: FindingOneExpectation;
};

export const compatibilityCases: Record<
    CompatibilityCase['name'],
    CompatibilityCase
> = {
    'finding-1-baseline': {
        name: 'finding-1-baseline',
        appRef: BASELINE_APP_REF,
        migrationRef: MIGRATION_REF,
        through: EXPAND_CONNECTIONS_MIGRATION,
        expected: {
            kind: 'postgres-error',
            code: '42702',
            column: 'organization_warehouse_credentials_uuid',
        },
    },
    'finding-1-candidate': {
        name: 'finding-1-candidate',
        appRef: 'candidate',
        migrationRef: MIGRATION_REF,
        through: EXPAND_CONNECTIONS_MIGRATION,
        expected: {
            kind: 'value',
            credentialMarker: 'project-authority',
        },
    },
};

export const getCompatibilityCase = (name: string): CompatibilityCase => {
    if (!(name in compatibilityCases)) {
        throw new Error(`Unknown compatibility case: ${name}`);
    }
    return compatibilityCases[name as CompatibilityCase['name']];
};
