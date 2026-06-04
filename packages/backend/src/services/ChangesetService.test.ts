import { buildAccount } from '../auth/account/account.mock';
import { ChangesetService } from './ChangesetService';

const projectUuid = '11111111-1111-4111-8111-111111111111';
const changeUuid = '22222222-2222-4222-8222-222222222222';
const account = buildAccount();

const changesetModel = {
    getChange: jest.fn(),
    revertChange: jest.fn(),
    findActiveChangesetWithChangesByProjectUuid: jest.fn(),
};

const projectModel = {
    findExploresFromCache: jest.fn(),
};

const catalogModel = {
    indexCatalogReverts: jest.fn(),
};

const service = new ChangesetService({
    changesetModel: changesetModel as never,
    catalogModel: catalogModel as never,
    projectModel: projectModel as never,
    savedChartModel: {} as never,
    dashboardModel: {} as never,
});

describe('ChangesetService tenant scoping', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('gets a change scoped to the authorized project', async () => {
        changesetModel.getChange.mockResolvedValue({
            changeUuid,
            dependencies: [],
        });

        await service.getChange(account, projectUuid, changeUuid);

        expect(changesetModel.getChange).toHaveBeenCalledWith(
            changeUuid,
            projectUuid,
        );
    });

    test('reverts a change scoped to the authorized project', async () => {
        changesetModel.findActiveChangesetWithChangesByProjectUuid.mockResolvedValue(
            {
                changes: [
                    {
                        changeUuid,
                        entityTableName: 'orders',
                    },
                ],
            },
        );
        changesetModel.getChange.mockResolvedValue({
            changeUuid,
            entityTableName: 'orders',
        });
        projectModel.findExploresFromCache.mockResolvedValue([]);

        await service.revertChange(account, projectUuid, changeUuid);

        expect(changesetModel.getChange).toHaveBeenCalledWith(
            changeUuid,
            projectUuid,
        );
        expect(changesetModel.revertChange).toHaveBeenCalledWith(
            changeUuid,
            projectUuid,
        );
    });
});
