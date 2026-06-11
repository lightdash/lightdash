import { Ability } from '@casl/ability';
import {
    DownloadAuditEntry,
    ForbiddenError,
    KnexPaginateArgs,
    OrganizationMemberRole,
    PaginationError,
    PossibleAbilities,
    type Account,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
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

const defaultPaginateArgs: KnexPaginateArgs = { page: 1, pageSize: 50 };

const makePagination = (overrides?: Partial<KnexPaginateArgs>) => ({
    page: overrides?.page ?? 1,
    pageSize: overrides?.pageSize ?? 50,
    totalPageCount: 1,
    totalResults: 1,
});

const makeDownloadAuditModel = (
    data: DownloadAuditEntry[] = [sampleEntry],
    pagination = makePagination(),
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
            lightdashConfig: lightdashConfigMock,
            analytics: analyticsMock,
            analyticsModel,
            downloadAuditModel,
            projectModel,
            csvService,
        });

        await expect(
            service.getDownloadActivity(
                projectUuid,
                forbiddenAccount,
                defaultPaginateArgs,
            ),
        ).rejects.toThrow(ForbiddenError);

        expect(downloadAuditModel.getDownloads).not.toHaveBeenCalled();
    });

    it('returns paginated download entries with pagination metadata', async () => {
        const pagination = makePagination();
        const downloadAuditModel = makeDownloadAuditModel(
            [sampleEntry],
            pagination,
        );
        const service = new AnalyticsService({
            lightdashConfig: lightdashConfigMock,
            analytics: analyticsMock,
            analyticsModel,
            downloadAuditModel,
            projectModel,
            csvService,
        });

        const result = await service.getDownloadActivity(
            projectUuid,
            allowedAccount,
            defaultPaginateArgs,
        );

        expect(result.data).toEqual([sampleEntry]);
        expect(result.pagination).toEqual(pagination);
        expect(downloadAuditModel.getDownloads).toHaveBeenCalledWith(
            organizationUuid,
            projectUuid,
            defaultPaginateArgs,
            undefined,
        );
    });

    it('passes paginateArgs to model and returns correct page metadata', async () => {
        const paginateArgs: KnexPaginateArgs = { page: 2, pageSize: 10 };
        const pagination = {
            page: 2,
            pageSize: 10,
            totalPageCount: 5,
            totalResults: 50,
        };
        const downloadAuditModel = makeDownloadAuditModel(
            [sampleEntry],
            pagination,
        );
        const service = new AnalyticsService({
            lightdashConfig: lightdashConfigMock,
            analytics: analyticsMock,
            analyticsModel,
            downloadAuditModel,
            projectModel,
            csvService,
        });

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
            undefined,
        );
    });

    it('returns empty data array when there are no downloads', async () => {
        const pagination = {
            page: 1,
            pageSize: 50,
            totalPageCount: 0,
            totalResults: 0,
        };
        const downloadAuditModel = makeDownloadAuditModel([], pagination);
        const service = new AnalyticsService({
            lightdashConfig: lightdashConfigMock,
            analytics: analyticsMock,
            analyticsModel,
            downloadAuditModel,
            projectModel,
            csvService,
        });

        const result = await service.getDownloadActivity(
            projectUuid,
            allowedAccount,
            defaultPaginateArgs,
        );

        expect(result.data).toEqual([]);
        expect(result.pagination).toEqual(pagination);
    });

    it('throws PaginationError when pageSize exceeds query.maxPageSize', async () => {
        const downloadAuditModel = makeDownloadAuditModel();
        const service = new AnalyticsService({
            lightdashConfig: lightdashConfigMock,
            analytics: analyticsMock,
            analyticsModel,
            downloadAuditModel,
            projectModel,
            csvService,
        });

        const oversized: KnexPaginateArgs = {
            page: 1,
            pageSize: lightdashConfigMock.query.maxPageSize + 1,
        };

        await expect(
            service.getDownloadActivity(projectUuid, allowedAccount, oversized),
        ).rejects.toThrow(PaginationError);

        expect(downloadAuditModel.getDownloads).not.toHaveBeenCalled();
    });
});
