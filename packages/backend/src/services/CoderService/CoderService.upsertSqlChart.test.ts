import { Ability, type RawRuleOf } from '@casl/ability';
import {
    AnyType,
    ForbiddenError,
    OrganizationMemberRole,
    PossibleAbilities,
    SessionUser,
    SqlChartAsCode,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { ContentVerificationModel } from '../../models/ContentVerificationModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SavedSqlModel } from '../../models/SavedSqlModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { PromoteService } from '../PromoteService/PromoteService';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { CoderService } from './CoderService';

const PROJECT_UUID = 'project-uuid';
const ORG_UUID = 'org-uuid';
const SPACE_UUID = 'space-uuid';
const OTHER_SPACE_UUID = 'other-space-uuid';

const makeUser = (
    rules: RawRuleOf<Ability<PossibleAbilities>>[],
): SessionUser =>
    ({
        userUuid: 'user-uuid',
        email: 'user@test.com',
        firstName: 'Test',
        lastName: 'User',
        organizationUuid: ORG_UUID,
        role: OrganizationMemberRole.MEMBER,
        ability: new Ability<PossibleAbilities>(rules),
        abilityRules: [],
    }) as unknown as SessionUser;

const sqlChartAsCode = {
    name: 'My SQL chart',
    description: 'desc',
    slug: 'my-sql-chart',
    sql: 'SELECT 1',
    limit: 500,
    config: {},
    version: 1,
    spaceSlug: 'my-space',
} as unknown as SqlChartAsCode;

const accessContext = (projectUuid: string = PROJECT_UUID) => ({
    organizationUuid: ORG_UUID,
    projectUuid,
    inheritsFromOrgOrProject: true,
    access: [],
    admins: [],
});

const buildService = (
    savedSqlModel: AnyType,
    getSpacesAccessContext: AnyType = jest.fn(
        async (_userUuid: string, spaceUuids: string[]) =>
            Object.fromEntries(
                spaceUuids.map((uuid) => [uuid, accessContext()]),
            ),
    ),
) =>
    new CoderService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        projectModel: {
            get: jest.fn(async () => ({
                projectUuid: PROJECT_UUID,
                organizationUuid: ORG_UUID,
            })),
        } as unknown as ProjectModel,
        savedChartModel: {} as unknown as SavedChartModel,
        savedSqlModel: savedSqlModel as unknown as SavedSqlModel,
        dashboardModel: {} as unknown as DashboardModel,
        spaceModel: {} as unknown as SpaceModel,
        schedulerClient: {} as unknown as SchedulerClient,
        promoteService: {} as unknown as PromoteService,
        spacePermissionService: {
            getSpacesAccessContext,
        } as unknown as SpacePermissionService,
        contentVerificationModel: {} as unknown as ContentVerificationModel,
    });

const stubSpace = (service: CoderService, uuid: string = SPACE_UUID) =>
    jest.spyOn(service, 'getOrCreateSpace').mockResolvedValue({
        space: { uuid } as AnyType,
        created: false,
    });

const existingRow = (spaceUuid: string = SPACE_UUID) => ({
    saved_sql_uuid: 'existing-uuid',
    space_uuid: spaceUuid,
    slug: sqlChartAsCode.slug,
});

const upsert = (service: CoderService, user: SessionUser) =>
    service.upsertSqlChart(
        user,
        PROJECT_UUID,
        sqlChartAsCode.slug,
        sqlChartAsCode,
    );

describe('CoderService.upsertSqlChart - permissions', () => {
    afterEach(() => jest.clearAllMocks());

    describe('create (chart does not exist yet)', () => {
        it('throws ForbiddenError with ContentAsCode but not CustomSql', async () => {
            const savedSqlModel = {
                find: jest.fn(async () => []),
                create: jest.fn(),
            };
            const service = buildService(savedSqlModel);
            stubSpace(service);
            const user = makeUser([
                { subject: 'ContentAsCode', action: 'manage' },
            ]);

            await expect(upsert(service, user)).rejects.toThrow(ForbiddenError);
            expect(savedSqlModel.create).not.toHaveBeenCalled();
        });

        it('throws ForbiddenError with CustomSql but no space create:SavedChart', async () => {
            const savedSqlModel = {
                find: jest.fn(async () => []),
                create: jest.fn(),
            };
            const service = buildService(savedSqlModel);
            stubSpace(service);
            const user = makeUser([
                { subject: 'ContentAsCode', action: 'manage' },
                { subject: 'CustomSql', action: 'manage' },
            ]);

            await expect(upsert(service, user)).rejects.toThrow(ForbiddenError);
            expect(savedSqlModel.create).not.toHaveBeenCalled();
        });

        it('creates the chart with ContentAsCode + CustomSql + create:SavedChart', async () => {
            const savedSqlModel = {
                find: jest.fn(async () => []),
                create: jest.fn(async () => ({ savedSqlUuid: 'new-uuid' })),
            };
            const service = buildService(savedSqlModel);
            stubSpace(service);
            const user = makeUser([
                { subject: 'ContentAsCode', action: 'manage' },
                { subject: 'CustomSql', action: 'manage' },
                {
                    subject: 'SavedChart',
                    action: 'create',
                    conditions: { projectUuid: PROJECT_UUID },
                },
            ]);

            await upsert(service, user);
            expect(savedSqlModel.create).toHaveBeenCalledTimes(1);
        });
    });

    describe('update (chart already exists)', () => {
        it('updates the chart with CustomSql + update:SavedChart in its space', async () => {
            const savedSqlModel = {
                find: jest.fn(async () => [existingRow(SPACE_UUID)]),
                update: jest.fn(async () => ({
                    savedSqlUuid: 'existing-uuid',
                })),
                create: jest.fn(),
            };
            const service = buildService(savedSqlModel);
            stubSpace(service, SPACE_UUID);
            const user = makeUser([
                { subject: 'ContentAsCode', action: 'manage' },
                { subject: 'CustomSql', action: 'manage' },
                {
                    subject: 'SavedChart',
                    action: 'update',
                    conditions: { projectUuid: PROJECT_UUID },
                },
            ]);

            await upsert(service, user);
            expect(savedSqlModel.update).toHaveBeenCalledTimes(1);
            expect(savedSqlModel.create).not.toHaveBeenCalled();
        });

        it('throws ForbiddenError on update without update:SavedChart', async () => {
            const savedSqlModel = {
                find: jest.fn(async () => [existingRow(SPACE_UUID)]),
                update: jest.fn(),
                create: jest.fn(),
            };
            const service = buildService(savedSqlModel);
            stubSpace(service, SPACE_UUID);
            const user = makeUser([
                { subject: 'ContentAsCode', action: 'manage' },
                { subject: 'CustomSql', action: 'manage' },
            ]);

            await expect(upsert(service, user)).rejects.toThrow(ForbiddenError);
            expect(savedSqlModel.update).not.toHaveBeenCalled();
        });

        it('blocks a move when the user lacks access to the chart current space', async () => {
            // Chart currently lives in OTHER_SPACE_UUID; YAML moves it to SPACE_UUID.
            // User can update in the target space but not the current one.
            const savedSqlModel = {
                find: jest.fn(async () => [existingRow(OTHER_SPACE_UUID)]),
                update: jest.fn(),
                create: jest.fn(),
            };
            const getSpacesAccessContext = jest.fn(
                async (_userUuid: string, spaceUuids: string[]) =>
                    Object.fromEntries(
                        spaceUuids.map((uuid) => [
                            uuid,
                            uuid === SPACE_UUID
                                ? accessContext(PROJECT_UUID)
                                : accessContext('inaccessible-project'),
                        ]),
                    ),
            );
            const service = buildService(savedSqlModel, getSpacesAccessContext);
            stubSpace(service, SPACE_UUID);
            const user = makeUser([
                { subject: 'ContentAsCode', action: 'manage' },
                { subject: 'CustomSql', action: 'manage' },
                {
                    subject: 'SavedChart',
                    action: 'update',
                    conditions: { projectUuid: PROJECT_UUID },
                },
            ]);

            await expect(upsert(service, user)).rejects.toThrow(ForbiddenError);
            expect(savedSqlModel.update).not.toHaveBeenCalled();
            // both the target and the current space were checked
            expect(getSpacesAccessContext).toHaveBeenCalledWith('user-uuid', [
                SPACE_UUID,
                OTHER_SPACE_UUID,
            ]);
        });
    });
});
