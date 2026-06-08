import { type SessionUser } from '@lightdash/common';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { AiService } from './AiService';

describe('AiService', () => {
    const projectUuid = 'project-uuid';
    const dashboardUuid = 'dashboard-uuid';
    const user = {
        userUuid: 'user-uuid',
        organizationUuid: 'organization-uuid',
    } as SessionUser;

    const createService = () => {
        const dashboardModel = {
            getByIdOrSlug: jest.fn().mockRejectedValue(new Error('stop')),
        };

        const service = new AiService({
            analytics: {
                track: jest.fn(),
            },
            dashboardModel,
            dashboardSummaryModel: {
                getByDashboardUuid: jest.fn(),
            },
            savedChartModel: {},
            projectService: {},
            asyncQueryService: {},
            openAi: {},
            lightdashConfig: lightdashConfigMock,
            featureFlagService: {
                get: jest.fn().mockResolvedValue({ enabled: true }),
            },
        } as unknown as ConstructorParameters<typeof AiService>[0]);

        return { service, dashboardModel };
    };

    test('scopes dashboard summary lookup to the requested project', async () => {
        const { service, dashboardModel } = createService();

        await expect(
            service.getDashboardSummary(user, projectUuid, dashboardUuid),
        ).rejects.toThrow('stop');

        expect(dashboardModel.getByIdOrSlug).toHaveBeenCalledWith(
            dashboardUuid,
            { projectUuid },
        );
    });
});
