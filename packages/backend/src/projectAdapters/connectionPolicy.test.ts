import {
    DbtProjectType,
    DuckdbConnectionType,
    DucklakeCatalogType,
    DucklakeDataPathType,
    SupportedDbtVersions,
    WarehouseTypes,
    type CreateDuckdbDucklakeCredentials,
} from '@lightdash/common';
import { warehouseClientFromCredentials } from '@lightdash/warehouses';
import { warehouseClientMock } from '../utils/QueryBuilder/MetricQueryBuilder.mock';
import { warehouseClientForCompileGroup } from './CompileGroup';
import { projectAdapterFromConfig } from './projectAdapter';

vi.mock('@lightdash/warehouses', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@lightdash/warehouses')>()),
    warehouseClientFromCredentials: vi.fn(() => warehouseClientMock),
}));

const credentials: CreateDuckdbDucklakeCredentials = {
    type: WarehouseTypes.DUCKDB,
    connectionType: DuckdbConnectionType.DUCKLAKE,
    schema: 'main',
    catalog: {
        type: DucklakeCatalogType.DUCKDB,
        path: '/tmp/catalog.ducklake',
    },
    dataPath: { type: DucklakeDataPathType.LOCAL, path: '/tmp/data/' },
};

beforeEach(() => vi.clearAllMocks());

it.each([true, false])(
    'applies the injected deployment policy before creating an adapter: %s',
    async (allowMultiOrgs) => {
        const adapter = projectAdapterFromConfig(
            { type: DbtProjectType.NONE },
            credentials,
            { warehouseCatalog: undefined, onWarehouseCatalogChange: vi.fn() },
            SupportedDbtVersions.V1_10,
            [],
            allowMultiOrgs,
            null,
        );
        if (allowMultiOrgs) {
            await expect(adapter).rejects.toThrow(
                'DuckLake connections are not supported',
            );
            expect(warehouseClientFromCredentials).not.toHaveBeenCalled();
        } else {
            await expect(adapter).resolves.toHaveProperty(
                'warehouseClient',
                warehouseClientMock,
            );
        }
    },
);

it.each([true, false])(
    'applies the injected deployment policy before creating a compile client: %s',
    (allowMultiOrgs) => {
        const create = () =>
            warehouseClientForCompileGroup(
                credentials,
                { listAllDatabases: false, additionalDatabases: [] },
                vi.fn(),
                allowMultiOrgs,
            );
        if (allowMultiOrgs) {
            expect(create).toThrow('DuckLake connections are not supported');
            expect(warehouseClientFromCredentials).not.toHaveBeenCalled();
        } else {
            expect(create()).toBe(warehouseClientMock);
        }
    },
);
