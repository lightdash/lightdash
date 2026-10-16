import {
    ExploreType,
    SupportedDbtAdapter,
    WarehouseTypes,
    WeekDay,
    type Explore,
} from '@lightdash/common';
import { fromSession } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { ProjectService } from './ProjectService';

const explore: Explore = {
    name: 'orders',
    label: 'Orders',
    baseTable: 'orders',
    tags: [],
    tables: {},
    joinedTables: [],
    targetDatabase: SupportedDbtAdapter.TRINO,
};
const account = fromSession(defaultSessionUser, 'session-cookie');

describe('explore response connection metadata', () => {
    it.each([false, true])(
        'returns the bound dialect with extra connection %s',
        async (extra) => {
            const target = extra
                ? ({ kind: 'extra', warehouseConnectionUuid: 'extra' } as const)
                : ({ kind: 'original' } as const);
            const service = new ProjectService({
                lightdashConfig: lightdashConfigMock,
                projectModel: {
                    getExploreWarehouseConnectionUuid: vi
                        .fn()
                        .mockResolvedValue(
                            extra ? 'extra' : 'original-identity',
                        ),
                    resolveWarehouseCredentialRead: vi
                        .fn()
                        .mockResolvedValue(target),
                    getWarehouseCredentialsForBinding: vi
                        .fn()
                        .mockResolvedValue({
                            type: WarehouseTypes.POSTGRES,
                            startOfWeek: WeekDay.SUNDAY,
                        }),
                },
                warehouseConnectionModel: {
                    getProject: vi
                        .fn()
                        .mockResolvedValue({ projectUuid: 'project' }),
                    getCredentials: vi.fn().mockResolvedValue({
                        type: WarehouseTypes.TRINO,
                        startOfWeek: WeekDay.WEDNESDAY,
                    }),
                },
            } as unknown as ConstructorParameters<typeof ProjectService>[0]);
            vi.spyOn(service, 'getExplore').mockResolvedValue(explore);
            const response = await service.getExploreResponse(
                account,
                'project',
                'orders',
            );
            expect(response.warehouseConnection).toEqual({
                warehouseConnectionUuid: extra ? 'extra' : null,
                warehouseType: extra
                    ? WarehouseTypes.TRINO
                    : WarehouseTypes.POSTGRES,
                startOfWeek: extra ? WeekDay.WEDNESDAY : WeekDay.SUNDAY,
            });
            vi.spyOn(service, 'getExplore').mockResolvedValue({
                ...explore,
                type: ExploreType.EXTERNAL_SOURCE,
            });
            expect(
                (await service.getExploreResponse(account, 'project', 'orders'))
                    .warehouseConnection.warehouseType,
            ).toBe(WarehouseTypes.DUCKDB);
        },
    );
});
