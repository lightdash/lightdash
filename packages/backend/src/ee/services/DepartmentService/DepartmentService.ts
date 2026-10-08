import { subject } from '@casl/ability';
import {
    assertIsAccountWithOrg,
    assertRegisteredAccount,
    FeatureFlags,
    ForbiddenError,
    getAncestorUuids,
    getParentMap,
    NotFoundError,
    ParameterError,
    resolveDepartmentMembership,
    type Account,
    type CreateDepartment,
    type Department,
    type DepartmentDetail,
    type DepartmentMember,
    type DepartmentMembership,
    type DepartmentOwnerInput,
    type OrganizationAdoptionSummary,
    type UpdateDepartment,
} from '@lightdash/common';
import { validate as isUuid } from 'uuid';
import {
    type ActivityWindows,
    type DepartmentAnalyticsModel,
} from '../../../models/DepartmentAnalyticsModel';
import { type DepartmentModel } from '../../../models/DepartmentModel';
import { BaseService } from '../../../services/BaseService';
import { type FeatureFlagService } from '../../../services/FeatureFlag/FeatureFlagService';
import {
    buildDepartmentMembers,
    computeTargetProgress,
    computeWeeklyWithOrgAverage,
} from './departmentDetail';
import {
    buildAdoptionSnapshot,
    lastNWeekStarts,
    type AdoptionSnapshot,
} from './departmentMetrics';

export const ACTIVE_DAYS = 30;
export const TREND_WEEKS = 12;
const TOP_CONTENT_LIMIT = 5;
const HEADCOUNT_NOTE_MAX_LENGTH = 500;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Deps = {
    featureFlagService: Pick<FeatureFlagService, 'get'>;
    departmentModel: DepartmentModel;
    departmentAnalyticsModel: DepartmentAnalyticsModel;
};

const MAX_INT4 = 2147483647;
const NAME_MAX_LENGTH = 255;
const MAX_LIST_LENGTH = 5000;

const daysBefore = (now: Date, days: number): Date => {
    const since = new Date(now);
    since.setUTCDate(since.getUTCDate() - days);
    return since;
};

// Rolling windows measured from one instant, shared by every read in a request
export const getActivityWindows = (
    now: Date = new Date(),
): ActivityWindows => ({
    activeSince: daysBefore(now, ACTIVE_DAYS),
    trendSince: daysBefore(now, TREND_WEEKS * 7),
});

const isWholeNonNegative = (value: number): boolean =>
    Number.isInteger(value) && value >= 0 && value <= MAX_INT4;

const isRealDate = (value: string): boolean => {
    if (!ISO_DATE.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
        !Number.isNaN(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === value
    );
};

const assertUuid = (value: unknown, label: string): void => {
    if (typeof value !== 'string' || !isUuid(value)) {
        throw new ParameterError(
            `${label} must be a valid UUID: ${String(value)}`,
        );
    }
};

const assertUuidList = (values: unknown, label: string): void => {
    if (!Array.isArray(values)) {
        throw new ParameterError(`${label} must be a list`);
    }
    if (values.length > MAX_LIST_LENGTH) {
        throw new ParameterError(
            `${label} can hold at most ${MAX_LIST_LENGTH} entries`,
        );
    }
    values.forEach((v) => assertUuid(v, label));
};

export const validateDepartmentInput = (data: UpdateDepartment): void => {
    if (data.name !== undefined) {
        if (data.name.trim().length === 0) {
            throw new ParameterError('Department name is required');
        }
        if (data.name.length > NAME_MAX_LENGTH) {
            throw new ParameterError(
                `Department name must be ${NAME_MAX_LENGTH} characters or fewer`,
            );
        }
    }
    if (
        data.headcount !== undefined &&
        data.headcount !== null &&
        !isWholeNonNegative(data.headcount)
    ) {
        throw new ParameterError(
            `Headcount must be a whole number of 0 or more, up to ${MAX_INT4}: ${data.headcount}`,
        );
    }
    if (
        data.targetActiveUsers !== undefined &&
        data.targetActiveUsers !== null &&
        !isWholeNonNegative(data.targetActiveUsers)
    ) {
        throw new ParameterError(
            `Target active users must be a whole number of 0 or more, up to ${MAX_INT4}: ${data.targetActiveUsers}`,
        );
    }
    if (
        data.targetDate !== undefined &&
        data.targetDate !== null &&
        !isRealDate(data.targetDate)
    ) {
        throw new ParameterError(
            `Target date must be a real date in YYYY-MM-DD format: ${data.targetDate}`,
        );
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
    if (
        data.parentDepartmentUuid !== undefined &&
        data.parentDepartmentUuid !== null
    ) {
        assertUuid(data.parentDepartmentUuid, 'Parent department');
    }
};

const assertOwners = (owners: DepartmentOwnerInput[]): void => {
    if (!Array.isArray(owners)) {
        throw new ParameterError('Owners must be a list');
    }
    if (owners.length > MAX_LIST_LENGTH) {
        throw new ParameterError(
            `Owners can hold at most ${MAX_LIST_LENGTH} entries`,
        );
    }
    owners.forEach((o) => {
        if (o.type !== 'user' && o.type !== 'group') {
            throw new ParameterError(
                `Owner type must be user or group: ${String(o.type)}`,
            );
        }
        assertUuid(o.uuid, 'Owner');
    });
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
        windows: ActivityWindows,
    ): Promise<AdoptionSnapshot> {
        const [departments, rows] = await Promise.all([
            this.departmentModel.listByOrganization(organizationUuid),
            this.departmentModel.getResolvedMemberRows(organizationUuid),
        ]);
        const membership = resolveDepartmentMembership(rows, departments);
        const activity = await this.departmentAnalyticsModel.getActivity(
            organizationUuid,
            membership.map((m) => m.userUuid),
            windows,
        );
        return buildAdoptionSnapshot({
            departments,
            membership,
            activeUserUuids: new Set(activity.activeUserUuids),
            weeklyActivity: activity.weeklyActivity,
            weekStarts: lastNWeekStarts(TREND_WEEKS),
        });
    }

    async getSummary(account: Account): Promise<OrganizationAdoptionSummary> {
        const { organizationUuid } = await this.authorize(account, 'view');
        const snapshot = await this.loadSnapshot(
            organizationUuid,
            getActivityWindows(),
        );
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

    protected async loadMembers(
        organizationUuid: string,
        snapshot: AdoptionSnapshot,
        departmentUuid: string,
        activeSince: Date,
    ): Promise<DepartmentMember[]> {
        const members = snapshot.rolledMembers.get(departmentUuid) ?? [];
        const activity = await this.departmentAnalyticsModel.getMemberActivity(
            organizationUuid,
            members.map((m) => m.userUuid),
            activeSince,
        );
        return buildDepartmentMembers({
            departmentUuid,
            members,
            departments: snapshot.summary.departments,
            activity,
        });
    }

    async getDetail(
        account: Account,
        departmentUuid: string,
    ): Promise<DepartmentDetail> {
        const { organizationUuid } = await this.authorize(account, 'view');
        assertUuid(departmentUuid, 'Department');
        // The count and the member list share these bounds, so they agree on who is active
        const windows = getActivityWindows();
        const snapshot = await this.loadSnapshot(organizationUuid, windows);
        const all = snapshot.summary.departments;
        const department = all.find((d) => d.departmentUuid === departmentUuid);
        // Same error whether it is missing or belongs to another organization
        if (!department) {
            throw new NotFoundError(`Department ${departmentUuid} not found`);
        }
        const memberUuids = (
            snapshot.rolledMembers.get(departmentUuid) ?? []
        ).map((m) => m.userUuid);
        const [members, topContent] = await Promise.all([
            this.loadMembers(
                organizationUuid,
                snapshot,
                departmentUuid,
                windows.activeSince,
            ),
            this.departmentAnalyticsModel.getTopContent(
                organizationUuid,
                memberUuids,
                windows.activeSince,
                TOP_CONTENT_LIMIT,
            ),
        ]);
        const names = new Map(all.map((d) => [d.departmentUuid, d.name]));
        return {
            department,
            ancestors: getAncestorUuids(departmentUuid, getParentMap(all))
                .reverse()
                .map((uuid) => ({
                    departmentUuid: uuid,
                    name: names.get(uuid) ?? '',
                })),
            children: all.filter(
                (d) => d.parentDepartmentUuid === departmentUuid,
            ),
            targetProgress: computeTargetProgress(
                department,
                department.metrics.activeCount30d,
            ),
            weeklyActive: computeWeeklyWithOrgAverage(department, all),
            topContent,
            members,
        };
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
        assertUuid(departmentUuid, 'Department');
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
        assertUuid(departmentUuid, 'Department');
        await this.departmentModel.delete(organizationUuid, departmentUuid);
    }

    async setGroups(
        account: Account,
        departmentUuid: string,
        groupUuids: string[],
    ): Promise<Department> {
        const { organizationUuid } = await this.authorize(account, 'manage');
        assertUuid(departmentUuid, 'Department');
        assertUuidList(groupUuids, 'Group');
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
        assertUuid(departmentUuid, 'Department');
        assertUuidList(userUuids, 'User');
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
        assertUuid(departmentUuid, 'Department');
        assertOwners(owners);
        return this.departmentModel.setOwners(
            organizationUuid,
            departmentUuid,
            owners,
        );
    }
}
