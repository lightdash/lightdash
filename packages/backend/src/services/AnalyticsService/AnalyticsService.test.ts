import { Ability } from '@casl/ability';
import {
    DownloadAuditEntry,
    ForbiddenError,
    KnexPaginateArgs,
    OrganizationMemberRole,
    PossibleAbilities,
    type Account,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import type { AnalyticsModel } from '../../models/AnalyticsModel';
import type { DownloadAuditModel } from '../../models/DownloadAuditModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import type { CsvService } from '../CsvService/CsvService';
import { AnalyticsService } from './AnalyticsService';

const projectUuid = 'project-uuid';
const organizationUuid = 'org-uuid';
const projectName = 'Test Project';

const projectModel = {
    get: jest.fn(async () => ({
        organizationUuid,
        name: projectName,
        projectUuid,
    })),
} as unknown as ProjectModel;

const analyticsModel = {} as unknown as AnalyticsModel;
const csvService = {} as unknown as CsvService;

const sampleEntry: DownloadAuditEntry = {
    downloadUuid: 'dl-uuid',
    queryUuid: 'q-uuid',
    userUuid: 'user-uuid',
    userFirstName: 'Alice',
    userLastName: 'Smith',
    fileType: 'csv',
    downloadedAt: new Date('2024-01-01T00:00:00Z'),
    originalQueryContext: null,
};

const makeDownloadAuditModel = (
    data: DownloadAuditEntry[] = [sampleEntry],
    pagination?: KnexPaginateArgs & {
        totalPageCount: number;
        totalResults: number;
    },
) =>
    ({
        getDownloads: jest.fn(async () => ({ data, pagination })),
    }) as unknown as DownloadAuditModel;

const makeAccount = (canViewAnalytics: boolean): Account =>
    ({
        user: {
            id: 'user-id',
            type: 'registered',
            role: OrganizationMemberRole.ADMIN,
            ability: new Ability<PossibleAbilities>(
                canViewAnalytics
                    ? [{ subject: 'Analytics', action: 'view' }]
                    : [],
            ),
            abilityRules: [],
        },
        organization: {
            organizationUuid,
            name: 'Test Org',
            createdAt: new Date(),
        },
        authentication: { type: 'session' },
        isSessionUser: () => true,
        isRegisteredUser: () => true,
        isJwtUser: () => false,
        isAnonymousUser: () => false,
        isServiceAccount: () => false,
        isPatUser: () => false,
        isOauthUser: () => false,
        isAuthenticated: () => true,
    }) as unknown as Account;

const allowedAccount = makeAccount(true);
const forbiddenAccount = makeAccount(false);

describe('AnalyticsService.getDownloadActivity', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('throws ForbiddenError when account lacks Analytics view permission', async () => {
        const downloadAuditModel = makeDownloadAuditModel();
        const service = new AnalyticsService({
            analytics: analyticsMock,
            analyticsModel,
            downloadAuditModel,
            projectModel,
            csvService,
        });

        await expect(
            service.getDownloadActivity(projectUuid, forbiddenAccount),
        ).rejects.toThrow(ForbiddenError);

        expect(downloadAuditModel.getDownloads).not.toHaveBeenCalled();
    });

    it('returns download entries without pagination when no paginateArgs provided', async () => {
        const downloadAuditModel = makeDownloadAuditModel([sampleEntry]);
        const service = new AnalyticsService({
            analytics: analyticsMock,
            analyticsModel,
            downloadAuditModel,
            projectModel,
            csvService,
        });

        const result = await service.getDownloadActivity(
            projectUuid,
            allowedAccount,
        );

        expect(result.data).toEqual([sampleEntry]);
        expect(result.pagination).toBeUndefined();
        expect(downloadAuditModel.getDownloads).toHaveBeenCalledWith(
            organizationUuid,
            projectUuid,
            undefined,
        );
    });

    it('passes paginateArgs to model and returns pagination metadata', async () => {
        const pagination = {
            page: 1,
            pageSize: 10,
            totalPageCount: 3,
            totalResults: 25,
        };
        const downloadAuditModel = makeDownloadAuditModel(
            [sampleEntry],
            pagination,
        );
        const service = new AnalyticsService({
            analytics: analyticsMock,
            analyticsModel,
            downloadAuditModel,
            projectModel,
            csvService,
        });

        const paginateArgs: KnexPaginateArgs = { page: 1, pageSize: 10 };
        const result = await service.getDownloadActivity(
            projectUuid,
            allowedAccount,
            paginateArgs,
        );

        expect(result.data).toEqual([sampleEntry]);
        expect(result.pagination).toEqual(pagination);
        expect(downloadAuditModel.getDownloads).toHaveBeenCalledWith(
            organizationUuid,
            projectUuid,
            paginateArgs,
        );
    });

    it('returns empty data array when there are no downloads', async () => {
        const downloadAuditModel = makeDownloadAuditModel([]);
        const service = new AnalyticsService({
            analytics: analyticsMock,
            analyticsModel,
            downloadAuditModel,
            projectModel,
            csvService,
        });

        const result = await service.getDownloadActivity(
            projectUuid,
            allowedAccount,
        );

        expect(result.data).toEqual([]);
        expect(result.pagination).toBeUndefined();
    });

    it('tracks download_activity_viewed analytics event', async () => {
        const downloadAuditModel = makeDownloadAuditModel();
        const service = new AnalyticsService({
            analytics: analyticsMock,
            analyticsModel,
            downloadAuditModel,
            projectModel,
            csvService,
        });

        const trackSpy = jest.spyOn(analyticsMock, 'track');

        await service.getDownloadActivity(projectUuid, allowedAccount);

        expect(trackSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'usage_analytics.download_activity_viewed',
                userId: allowedAccount.user.id,
                properties: expect.objectContaining({
                    projectId: projectUuid,
                    organizationId: organizationUuid,
                }),
            }),
        );
    });
});
