import { subject } from '@casl/ability';
import {
    assertIsAccountWithOrg,
    assertRegisteredAccount,
    FeatureFlags,
    ForbiddenError,
    getAncestorUuids,
    getParentMap,
    hasControlCharacter,
    normalizeDepartmentName,
    NotFoundError,
    ParameterError,
    resolveDepartmentMembership,
    truncateForMessage,
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
import {
    type DepartmentModel,
    type DepartmentTreeLimits,
} from '../../../models/DepartmentModel';
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
// A member's last activity is read this far back; beyond it the page says "No recorded activity"
export const LAST_ACTIVE_DAYS = 90;
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
const TARGET_YEAR_MIN = 1900;
const TARGET_YEAR_MAX = 2200;
const MAX_OWNERS = 20;

// Bounds that keep the tree walks, the responses and the map small enough to stay fast
export const DEPARTMENT_TREE_LIMITS: DepartmentTreeLimits = {
    maxDepartments: 1000,
    maxDepth: 10,
};

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
    lastActiveSince: daysBefore(now, LAST_ACTIVE_DAYS),
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

// Postgres has no year 0, and no sensible target sits centuries away
const isTargetYear = (value: string): boolean => {
    const year = Number(value.slice(0, 4));
    return year >= TARGET_YEAR_MIN && year <= TARGET_YEAR_MAX;
};

// Lower case, so a uuid matches the same everywhere: Postgres compares uuids in any case, JavaScript does not
const toUuid = (value: unknown, label: string): string => {
    if (typeof value !== 'string' || !isUuid(value)) {
        throw new ParameterError(
            `${label} must be a valid UUID: ${truncateForMessage(value)}`,
        );
    }
    return value.toLowerCase();
};

const toUuidList = (values: unknown, label: string): string[] => {
    if (!Array.isArray(values)) {
        throw new ParameterError(`${label} must be a list`);
    }
    if (values.length > MAX_LIST_LENGTH) {
        throw new ParameterError(
            `${label} can hold at most ${MAX_LIST_LENGTH} entries`,
        );
    }
    return values.map((v: unknown) => toUuid(v, label));
};

export const validateDepartmentInput = (data: UpdateDepartment): void => {
    if (data.name !== undefined) {
        // Checked before normalising, which would quietly turn a tab or line break into a space
        if (hasControlCharacter(data.name)) {
            throw new ParameterError(
                'Department name cannot contain control characters such as tabs or line breaks',
            );
        }
        const name = normalizeDepartmentName(data.name);
        if (name.length === 0) {
            throw new ParameterError('Department name is required');
        }
        if (name.length > NAME_MAX_LENGTH) {
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
            `Headcount must be a whole number of 0 or more, up to ${MAX_INT4}: ${truncateForMessage(data.headcount)}`,
        );
    }
    if (
        data.targetActiveUsers !== undefined &&
        data.targetActiveUsers !== null &&
        !isWholeNonNegative(data.targetActiveUsers)
    ) {
        throw new ParameterError(
            `Target active users must be a whole number of 0 or more, up to ${MAX_INT4}: ${truncateForMessage(data.targetActiveUsers)}`,
        );
    }
    if (data.targetDate !== undefined && data.targetDate !== null) {
        if (!isRealDate(data.targetDate)) {
            throw new ParameterError(
                `Target date must be a real date in YYYY-MM-DD format: ${truncateForMessage(data.targetDate)}`,
            );
        }
        if (!isTargetYear(data.targetDate)) {
            throw new ParameterError(
                `Target date must be between the years ${TARGET_YEAR_MIN} and ${TARGET_YEAR_MAX}: ${data.targetDate}`,
            );
        }
    }
    if (data.headcountNote !== undefined && data.headcountNote !== null) {
        if (hasControlCharacter(data.headcountNote)) {
            throw new ParameterError(
                'Headcount note cannot contain control characters such as tabs or line breaks',
            );
        }
        if (data.headcountNote.length > HEADCOUNT_NOTE_MAX_LENGTH) {
            throw new ParameterError(
                'Headcount note must be 500 characters or fewer',
            );
        }
    }
    if (
        data.parentDepartmentUuid !== undefined &&
        data.parentDepartmentUuid !== null
    ) {
        toUuid(data.parentDepartmentUuid, 'Parent department');
    }
};

// What the model stores: the name in the form names are compared in, uuids in lower case
const normalizeCreate = (data: CreateDepartment): CreateDepartment => ({
    ...data,
    name: normalizeDepartmentName(data.name),
    parentDepartmentUuid:
        data.parentDepartmentUuid === null
            ? null
            : data.parentDepartmentUuid.toLowerCase(),
});

const normalizeUpdate = (data: UpdateDepartment): UpdateDepartment => ({
    ...data,
    ...(data.name === undefined
        ? {}
        : { name: normalizeDepartmentName(data.name) }),
    ...(typeof data.parentDepartmentUuid === 'string'
        ? { parentDepartmentUuid: data.parentDepartmentUuid.toLowerCase() }
        : {}),
});

const toOwners = (owners: DepartmentOwnerInput[]): DepartmentOwnerInput[] => {
    if (!Array.isArray(owners)) {
        throw new ParameterError('Owners must be a list');
    }
    if (owners.length > MAX_LIST_LENGTH) {
        throw new ParameterError(
            `Owners can hold at most ${MAX_LIST_LENGTH} entries`,
        );
    }
    const valid = owners.map((o): DepartmentOwnerInput => {
        if (o.type !== 'user' && o.type !== 'group') {
            throw new ParameterError(
                `Owner type must be user or group: ${truncateForMessage(o.type)}`,
            );
        }
        return { type: o.type, uuid: toUuid(o.uuid, 'Owner') };
    });
    // Counted once each, as they are stored
    if (new Set(valid.map((o) => `${o.type}:${o.uuid}`)).size > MAX_OWNERS) {
        throw new ParameterError(
            `A department can have at most ${MAX_OWNERS} owners`,
        );
    }
    return valid;
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
        windows: ActivityWindows,
    ): Promise<DepartmentMember[]> {
        const members = snapshot.rolledMembers.get(departmentUuid) ?? [];
        const activity = await this.departmentAnalyticsModel.getMemberActivity(
            organizationUuid,
            members.map((m) => m.userUuid),
            windows.activeSince,
            windows.lastActiveSince,
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
        rawDepartmentUuid: string,
    ): Promise<DepartmentDetail> {
        const { organizationUuid } = await this.authorize(account, 'view');
        const departmentUuid = toUuid(rawDepartmentUuid, 'Department');
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
                windows,
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
        return this.departmentModel.create(
            organizationUuid,
            normalizeCreate(data),
            userUuid,
            DEPARTMENT_TREE_LIMITS,
        );
    }

    async update(
        account: Account,
        rawDepartmentUuid: string,
        data: UpdateDepartment,
    ): Promise<Department> {
        const { organizationUuid, userUuid } = await this.authorize(
            account,
            'manage',
        );
        const departmentUuid = toUuid(rawDepartmentUuid, 'Department');
        validateDepartmentInput(data);
        return this.departmentModel.update(
            organizationUuid,
            departmentUuid,
            normalizeUpdate(data),
            userUuid,
            DEPARTMENT_TREE_LIMITS,
        );
    }

    async delete(account: Account, rawDepartmentUuid: string): Promise<void> {
        const { organizationUuid } = await this.authorize(account, 'manage');
        const departmentUuid = toUuid(rawDepartmentUuid, 'Department');
        await this.departmentModel.delete(organizationUuid, departmentUuid);
    }

    async setGroups(
        account: Account,
        rawDepartmentUuid: string,
        rawGroupUuids: string[],
    ): Promise<Department> {
        const { organizationUuid } = await this.authorize(account, 'manage');
        const departmentUuid = toUuid(rawDepartmentUuid, 'Department');
        const groupUuids = toUuidList(rawGroupUuids, 'Group');
        return this.departmentModel.setGroupLinks(
            organizationUuid,
            departmentUuid,
            groupUuids,
        );
    }

    async setMembers(
        account: Account,
        rawDepartmentUuid: string,
        rawUserUuids: string[],
    ): Promise<Department> {
        const { organizationUuid } = await this.authorize(account, 'manage');
        const departmentUuid = toUuid(rawDepartmentUuid, 'Department');
        const userUuids = toUuidList(rawUserUuids, 'User');
        return this.departmentModel.setMembers(
            organizationUuid,
            departmentUuid,
            userUuids,
        );
    }

    async setOwners(
        account: Account,
        rawDepartmentUuid: string,
        rawOwners: DepartmentOwnerInput[],
    ): Promise<Department> {
        const { organizationUuid } = await this.authorize(account, 'manage');
        const departmentUuid = toUuid(rawDepartmentUuid, 'Department');
        const owners = toOwners(rawOwners);
        return this.departmentModel.setOwners(
            organizationUuid,
            departmentUuid,
            owners,
        );
    }
}
