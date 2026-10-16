import { ExploreType, WarehouseTypes, WeekDay } from '@lightdash/common';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { encryptionUtilMock } from '../../models/ProjectModel/ProjectModel.mock';
import { WarehouseConnectionModel } from '../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { warehouseConnectionCredentials } from '../../services/WarehouseConnectionService/warehouseConnectionFixtures.mock';
import { getSqlBuilderForExplore } from './getSqlBuilderForExplore';

type ModelArguments = ConstructorParameters<typeof ProjectModel>[0];

const dialects = {
    [WarehouseTypes.POSTGRES]: '"',
    [WarehouseTypes.REDSHIFT]: '"',
    [WarehouseTypes.SNOWFLAKE]: '"',
    [WarehouseTypes.BIGQUERY]: '`',
    [WarehouseTypes.DATABRICKS]: '`',
    [WarehouseTypes.TRINO]: '"',
    [WarehouseTypes.ATHENA]: '"',
    [WarehouseTypes.CLICKHOUSE]: '"',
    [WarehouseTypes.DUCKDB]: '"',
} satisfies Record<WarehouseTypes, string>;

const pairs = Object.values(WarehouseTypes).map((extraType) => ({
    originalType:
        extraType === WarehouseTypes.POSTGRES
            ? WarehouseTypes.BIGQUERY
            : WarehouseTypes.POSTGRES,
    extraType,
}));
pairs.push({
    originalType: WarehouseTypes.BIGQUERY,
    extraType: WarehouseTypes.TRINO,
});

describe('bound connection SQL dialect', () => {
    afterEach(() => vi.restoreAllMocks());

    it.each(pairs)(
        'resolves $extraType with an original $originalType connection',
        async ({ originalType, extraType }) => {
            const projectModel = new ProjectModel({
                database: {} as ModelArguments['database'],
                encryptionUtil: encryptionUtilMock,
                lightdashConfig: lightdashConfigMock,
            });
            const resolve = vi
                .spyOn(projectModel, 'resolveWarehouseCredentialRead')
                .mockResolvedValue({
                    kind: 'extra',
                    warehouseConnectionUuid: 'extra',
                });
            const primary = vi
                .spyOn(projectModel, 'getWarehouseCredentialsForProject')
                .mockResolvedValue({
                    ...warehouseConnectionCredentials[originalType],
                    startOfWeek: WeekDay.SUNDAY,
                });
            vi.spyOn(
                WarehouseConnectionModel.prototype,
                'getProject',
            ).mockResolvedValue({
                projectUuid: 'project',
                organizationUuid: 'org',
                connectionMode: 'multi',
                originalWarehouseType: originalType,
            });
            const extra = vi
                .spyOn(WarehouseConnectionModel.prototype, 'getCredentials')
                .mockResolvedValue({
                    ...warehouseConnectionCredentials[extraType],
                    startOfWeek: WeekDay.WEDNESDAY,
                });
            const credentials =
                await projectModel.getWarehouseConnectionForBinding('project', {
                    kind: 'explore',
                    exploreName: 'orders',
                });
            const builder = getSqlBuilderForExplore(
                { type: ExploreType.DEFAULT },
                credentials,
            );
            expect(resolve).toHaveBeenCalledWith('project', {
                kind: 'explore',
                exploreName: 'orders',
            });
            expect(extra).toHaveBeenCalledWith(
                expect.objectContaining({ projectUuid: 'project' }),
                'extra',
            );
            expect(primary).not.toHaveBeenCalled();
            expect(builder.getAdapterType()).toBe(extraType);
            expect(builder.getFieldQuoteChar()).toBe(dialects[extraType]);
            expect(builder.getStartOfWeek()).toBe(WeekDay.WEDNESDAY);
        },
    );
});
