import {
    ApiSqlQueryResults,
    Explore,
    ExploreError,
    SessionUser,
    SupportedDbtAdapter,
    TablesConfiguration,
    TableSelectionType,
} from 'common';
import { ProjectAdapter } from '../../types';

export const user: SessionUser = {
    userUuid: 'userUuid',
    email: 'email',
    firstName: 'firstName',
    lastName: 'lastName',
    organizationUuid: 'organizationUuid',
    organizationName: 'organizationName',
    isTrackingAnonymized: false,
    userId: 0,
};

export const expectedTablesConfiguration: TablesConfiguration = {
    tableSelection: {
        type: TableSelectionType.ALL,
        value: null,
    },
};

export const updateTablesConfiguration: TablesConfiguration = {
    tableSelection: {
        type: TableSelectionType.WITH_NAMES,
        value: ['tableName'],
    },
};

export const expectedSqlResults: ApiSqlQueryResults = {
    rows: [{ col1: 'val1' }],
};

export const projectAdapterMock: ProjectAdapter = {
    compileAllExplores: jest.fn(),
    test: jest.fn(),
    destroy: jest.fn(),
    runQuery: jest.fn(async () => expectedSqlResults.rows),
};

export const validExplore: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: '',
    baseTable: 'a',
    joinedTables: [],
    tables: {
        a: {
            name: 'a',
            database: 'database',
            schema: 'schema',
            sqlTable: 'test.table',
            dimensions: {},
            metrics: {},
            lineageGraph: {},
        },
    },
};

export const exploreWithError: ExploreError = {
    name: 'error',
    errors: [],
};

export const expectedCatalog = {
    database: {
        schema: {
            a: {
                description: undefined,
                sqlTable: 'test.table',
            },
        },
    },
};
