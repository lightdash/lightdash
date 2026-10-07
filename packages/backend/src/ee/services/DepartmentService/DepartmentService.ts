import { subject } from '@casl/ability';
import {
    assertIsAccountWithOrg,
    assertRegisteredAccount,
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    resolveDepartmentMembership,
    type Account,
    type CreateDepartment,
    type Department,
    type DepartmentMembership,
    type DepartmentOwnerInput,
    type OrganizationAdoptionSummary,
    type UpdateDepartment,
} from '@lightdash/common';
import { type DepartmentAnalyticsModel } from '../../../models/DepartmentAnalyticsModel';
import { type DepartmentModel } from '../../../models/DepartmentModel';
import { BaseService } from '../../../services/BaseService';
import { type FeatureFlagService } from '../../../services/FeatureFlag/FeatureFlagService';
import {
    buildAdoptionSnapshot,
    lastNWeekStarts,
    type AdoptionSnapshot,
} from './departmentMetrics';

export const ACTIVE_DAYS = 30;
export const TREND_WEEKS = 12;
const HEADCOUNT_NOTE_MAX_LENGTH = 500;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Deps = {
    featureFlagService: Pick<FeatureFlagService, 'get'>;
    departmentModel: DepartmentModel;
    departmentAnalyticsModel: DepartmentAnalyticsModel;
};

const isWholeNonNegative = (value: number): boolean =>
    Number.isInteger(value) && value >= 0;

export const validateDepartmentInput = (data: UpdateDepartment): void => {
    if (data.name !== undefined && data.name.trim().length === 0) {
        throw new ParameterError('Department name is required');
    }
    if (
        data.headcount !== undefined &&
        data.headcount !== null &&
        !isWholeNonNegative(data.headcount)
    ) {
        throw new ParameterError(
            'Headcount must be a whole number of 0 or more',
        );
    }
    if (
        data.targetActiveUsers !== undefined &&
        data.targetActiveUsers !== null &&
        !isWholeNonNegative(data.targetActiveUsers)
    ) {
        throw new ParameterError(
            'Target active users must be a whole number of 0 or more',
        );
    }
    if (
        data.targetDate !== undefined &&
        data.targetDate !== null &&
        !ISO_DATE.test(data.targetDate)
    ) {
        throw new ParameterError('Target date must be YYYY-MM-DD');
    }
    if (
        data.headcountNote !== undefined &&
        data.headcountNote !== null &&
        data.headcountNote.length > HEADCOUNT_NOTE_MAX_LENGTH
    ) {
        throw new ParameterError(
            'Headcount note must be 500 characters or fewer',
        );
    }
};

export class DepartmentService extends BaseService {
    protected readonly featureFlagService: Deps['featureFlagService'];

    protected readonly departmentModel: DepartmentModel;

    protected readonly departmentAnalyticsModel: DepartmentAnalyticsModel;

    constructor({
        featureFlagService,
        departmentModel,
        departmentAnalyticsModel,
    }: Deps) {
        super();
        this.featureFlagService = featureFlagService;
        this.departmentModel = departmentModel;
        this.departmentAnalyticsModel = departmentAnalyticsModel;
    }

    protected async authorize(
        account: Account,
        action: 'view' | 'manage',
    ): Promise<{ organizationUuid: string; userUuid: string }> {
        assertRegisteredAccount(account);
        assertIsAccountWithOrg(account);
        const { organizationUuid } = account.organization;
        const flag = await this.featureFlagService.get({
            user: { userUuid: account.user.userUuid, organizationUuid },
            featureFlagId: FeatureFlags.OrganizationAdoption,
        });
        if (!flag.enabled) throw new NotFoundError('Not found');
        const ability = this.createAuditedAbility(account);
        if (
            ability.cannot(
                action,
                subject('OrganizationAdoption', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have access to adoption by department',
            );
        }
        return { organizationUuid, userUuid: account.user.userUuid };
    }

    protected async loadSnapshot(
        organizationUuid: string,
    ): Promise<AdoptionSnapshot> {
        const [departments, rows] = await Promise.all([
            this.departmentModel.listByOrganization(organizationUuid),
            this.departmentModel.getResolvedMemberRows(organizationUuid),
        ]);
        const membership = resolveDepartmentMembership(rows, departments);
        const allUuids = membership.map((m) => m.userUuid);
        const [active, weeklyActivity] = await Promise.all([
            this.departmentAnalyticsModel.getActiveUserUuids(
                organizationUuid,
                allUuids,
                ACTIVE_DAYS,
            ),
            this.departmentAnalyticsModel.getWeeklyActivity(
                organizationUuid,
                allUuids,
                TREND_WEEKS,
            ),
        ]);
        return buildAdoptionSnapshot({
            departments,
            membership,
            activeUserUuids: new Set(active),
            weeklyActivity,
            weekStarts: lastNWeekStarts(TREND_WEEKS),
        });
    }

    async getSummary(account: Account): Promise<OrganizationAdoptionSummary> {
        const { organizationUuid } = await this.authorize(account, 'view');
        const snapshot = await this.loadSnapshot(organizationUuid);
        return snapshot.summary;
    }

    async getMembership(account: Account): Promise<DepartmentMembership[]> {
        const { organizationUuid } = await this.authorize(account, 'view');
        const [departments, rows] = await Promise.all([
            this.departmentModel.listByOrganization(organizationUuid),
            this.departmentModel.getResolvedMemberRows(organizationUuid),
        ]);
        return resolveDepartmentMembership(rows, departments);
    }

    async create(
        account: Account,
        data: CreateDepartment,
    ): Promise<Department> {
        const { organizationUuid, userUuid } = await this.authorize(
            account,
            'manage',
        );
        validateDepartmentInput(data);
        return this.departmentModel.create(organizationUuid, data, userUuid);
    }

    async update(
        account: Account,
        departmentUuid: string,
        data: UpdateDepartment,
    ): Promise<Department> {
        const { organizationUuid, userUuid } = await this.authorize(
            account,
            'manage',
        );
        validateDepartmentInput(data);
        return this.departmentModel.update(
            organizationUuid,
            departmentUuid,
            data,
            userUuid,
        );
    }

    async delete(account: Account, departmentUuid: string): Promise<void> {
        const { organizationUuid } = await this.authorize(account, 'manage');
        await this.departmentModel.delete(organizationUuid, departmentUuid);
    }

    async setGroups(
        account: Account,
        departmentUuid: string,
        groupUuids: string[],
    ): Promise<Department> {
        const { organizationUuid } = await this.authorize(account, 'manage');
        return this.departmentModel.setGroupLinks(
            organizationUuid,
            departmentUuid,
            groupUuids,
        );
    }

    async setMembers(
        account: Account,
        departmentUuid: string,
        userUuids: string[],
    ): Promise<Department> {
        const { organizationUuid } = await this.authorize(account, 'manage');
        return this.departmentModel.setMembers(
            organizationUuid,
            departmentUuid,
            userUuids,
        );
    }

    async setOwners(
        account: Account,
        departmentUuid: string,
        owners: DepartmentOwnerInput[],
    ): Promise<Department> {
        const { organizationUuid } = await this.authorize(account, 'manage');
        return this.departmentModel.setOwners(
            organizationUuid,
            departmentUuid,
            owners,
        );
    }
}
