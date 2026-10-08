import { subject } from '@casl/ability';
import {
    assertIsAccountWithOrg,
    assertRegisteredAccount,
    FeatureFlags,
    ForbiddenError,
    getActivityWindows,
    getAncestorUuids,
    getParentMap,
    hasControlCharacter,
    normalizeDepartmentName,
    NotFoundError,
    ParameterError,
    resolveDepartmentMembership,
    truncateForMessage,
    type Account,
    type ActivityWindows,
    type CreateDepartment,
    type Department,
    type DepartmentDetail,
    type DepartmentMember,
    type DepartmentMembership,
    type DepartmentOverlaps,
    type DepartmentOwnerInput,
    type OrganizationAdoptionSummary,
    type SetPrimaryDepartment,
    type UpdateDepartment,
} from '@lightdash/common';
import { validate as isUuid } from 'uuid';
import { type DepartmentAnalyticsModel } from '../../../models/DepartmentAnalyticsModel';
import {
    notAnActiveMemberMessage,
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
import {
    computeDepartmentOverlaps,
    getMembersInRegion,
} from './departmentOverlaps';

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
// A longer raw name is refused before normalising, which can make a name many times longer
const NAME_MAX_RAW_LENGTH = NAME_MAX_LENGTH * 4;
const MAX_LIST_LENGTH = 5000;
const TARGET_YEAR_MIN = 1900;
const TARGET_YEAR_MAX = 2200;
const MAX_OWNERS = 20;
// The overlap diagram shows at most three sets, so with and without each list at most two departments
const MAX_OVERLAP_DEPARTMENTS = 2;

// Bounds that keep the tree walks, the responses and the map small enough to stay fast
export const DEPARTMENT_TREE_LIMITS: DepartmentTreeLimits = {
    maxDepartments: 1000,
    maxDepth: 10,
};

// The organization snapshot is reused this long; any write through this service drops it sooner
const SNAPSHOT_TTL_MS = 60_000;
const SNAPSHOT_CACHE_LIMIT = 500;

type LoadedSnapshot = { snapshot: AdoptionSnapshot; windows: ActivityWindows };

type CachedSnapshot = {
    loaded: Promise<LoadedSnapshot>;
    expiresAt: number;
};

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
        if (data.name.length > NAME_MAX_RAW_LENGTH) {
            throw new ParameterError(
                `Department name must be ${NAME_MAX_LENGTH} characters or fewer`,
            );
        }
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

// A with or without list for overlaps; an empty list is the same as leaving it out
const toOverlapList = (
    listName: 'with' | 'without',
    values: string[] | undefined,
    departmentUuid: string,
): string[] | null => {
    if (values === undefined) return null;
    const uuids = toUuidList(values, 'Department');
    if (uuids.length > MAX_OVERLAP_DEPARTMENTS) {
        throw new ParameterError(
            `"${listName}" can list at most ${MAX_OVERLAP_DEPARTMENTS} departments`,
        );
    }
    if (uuids.includes(departmentUuid)) {
        throw new ParameterError(
            `"${listName}" cannot list the department itself`,
        );
    }
    return uuids.length === 0 ? null : Array.from(new Set(uuids));
};

export class DepartmentService extends BaseService {
    protected readonly featureFlagService: Deps['featureFlagService'];

    protected readonly departmentModel: DepartmentModel;

    protected readonly departmentAnalyticsModel: DepartmentAnalyticsModel;

    // Per process: another backend process keeps its own copy until it expires
    private readonly snapshots = new Map<string, CachedSnapshot>();

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
            lastActiveAt: activity.lastActiveAt,
            windows,
            weeklyActivity: activity.weeklyActivity,
            weekStarts: lastNWeekStarts(TREND_WEEKS),
        });
    }

    // Requests that arrive together share one load, since the pending load is what is kept
    protected getSnapshot(organizationUuid: string): Promise<LoadedSnapshot> {
        const now = Date.now();
        const cached = this.snapshots.get(organizationUuid);
        if (cached && cached.expiresAt > now) return cached.loaded;
        this.snapshots.delete(organizationUuid);
        const windows = getActivityWindows(new Date(now));
        const loaded = this.loadSnapshot(organizationUuid, windows).then(
            (snapshot) => ({ snapshot, windows }),
        );
        const entry: CachedSnapshot = {
            loaded,
            expiresAt: now + SNAPSHOT_TTL_MS,
        };
        this.snapshots.set(organizationUuid, entry);
        // A failed load is not kept, so the next request tries again
        void loaded.catch(() => {
            if (this.snapshots.get(organizationUuid) === entry) {
                this.snapshots.delete(organizationUuid);
            }
        });
        // A Map keeps insertion order, so its first key is the oldest entry
        if (this.snapshots.size > SNAPSHOT_CACHE_LIMIT) {
            const [oldest] = this.snapshots.keys();
            this.snapshots.delete(oldest);
        }
        return loaded;
    }

    protected invalidateSnapshot(organizationUuid: string): void {
        this.snapshots.delete(organizationUuid);
    }

    async getSummary(account: Account): Promise<OrganizationAdoptionSummary> {
        const { organizationUuid } = await this.authorize(account, 'view');
        const { snapshot } = await this.getSnapshot(organizationUuid);
        return snapshot.summary;
    }

    // Read now, not from the snapshot, which another backend process may have outdated
    protected async resolveMembership(
        organizationUuid: string,
    ): Promise<DepartmentMembership[]> {
        const [departments, rows] = await Promise.all([
            this.departmentModel.listByOrganization(organizationUuid),
            this.departmentModel.getResolvedMemberRows(organizationUuid),
        ]);
        return resolveDepartmentMembership(rows, departments);
    }

    async getMembership(account: Account): Promise<DepartmentMembership[]> {
        const { organizationUuid } = await this.authorize(account, 'view');
        return this.resolveMembership(organizationUuid);
    }

    protected async loadMembers(
        organizationUuid: string,
        snapshot: AdoptionSnapshot,
        departmentUuid: string,
        members: DepartmentMembership[],
        windows: ActivityWindows,
    ): Promise<DepartmentMember[]> {
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
            windows,
        });
    }

    async getDetail(
        account: Account,
        rawDepartmentUuid: string,
    ): Promise<DepartmentDetail> {
        const { organizationUuid } = await this.authorize(account, 'view');
        const departmentUuid = toUuid(rawDepartmentUuid, 'Department');
        // The count and the member list share the snapshot's bounds, so they agree on who is active
        const { snapshot, windows } = await this.getSnapshot(organizationUuid);
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
                snapshot.rolledMembers.get(departmentUuid) ?? [],
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

    // members: the people of the department in every with department and in no without department
    async getOverlaps(
        account: Account,
        rawDepartmentUuid: string,
        rawWithUuids?: string[],
        rawWithoutUuids?: string[],
    ): Promise<DepartmentOverlaps> {
        const { organizationUuid } = await this.authorize(account, 'view');
        const departmentUuid = toUuid(rawDepartmentUuid, 'Department');
        const withUuids = toOverlapList('with', rawWithUuids, departmentUuid);
        const withoutUuids = toOverlapList(
            'without',
            rawWithoutUuids,
            departmentUuid,
        );
        const inBoth = withUuids?.find((uuid) => withoutUuids?.includes(uuid));
        if (inBoth !== undefined) {
            throw new ParameterError(
                `Department ${inBoth} cannot be in both "with" and "without"`,
            );
        }
        const { snapshot, windows } = await this.getSnapshot(organizationUuid);
        const all = snapshot.summary.departments;
        const department = all.find((d) => d.departmentUuid === departmentUuid);
        if (!department) {
            throw new NotFoundError(`Department ${departmentUuid} not found`);
        }
        const known = new Set(all.map((d) => d.departmentUuid));
        const unknown = [...(withUuids ?? []), ...(withoutUuids ?? [])].find(
            (uuid) => !known.has(uuid),
        );
        if (unknown !== undefined) {
            throw new ParameterError(
                `Department ${unknown} is not in this organization`,
            );
        }
        return {
            department: { departmentUuid, name: department.name },
            ...computeDepartmentOverlaps(snapshot, departmentUuid),
            members:
                withUuids === null && withoutUuids === null
                    ? null
                    : await this.loadMembers(
                          organizationUuid,
                          snapshot,
                          departmentUuid,
                          getMembersInRegion(
                              snapshot,
                              departmentUuid,
                              withUuids ?? [],
                              withoutUuids ?? [],
                          ),
                          windows,
                      ),
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
        try {
            return await this.departmentModel.create(
                organizationUuid,
                normalizeCreate(data),
                userUuid,
                DEPARTMENT_TREE_LIMITS,
            );
        } finally {
            this.invalidateSnapshot(organizationUuid);
        }
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
        try {
            return await this.departmentModel.update(
                organizationUuid,
                departmentUuid,
                normalizeUpdate(data),
                userUuid,
                DEPARTMENT_TREE_LIMITS,
            );
        } finally {
            this.invalidateSnapshot(organizationUuid);
        }
    }

    async delete(account: Account, rawDepartmentUuid: string): Promise<void> {
        const { organizationUuid } = await this.authorize(account, 'manage');
        const departmentUuid = toUuid(rawDepartmentUuid, 'Department');
        try {
            await this.departmentModel.delete(organizationUuid, departmentUuid);
        } finally {
            this.invalidateSnapshot(organizationUuid);
        }
    }

    async setGroups(
        account: Account,
        rawDepartmentUuid: string,
        rawGroupUuids: string[],
    ): Promise<Department> {
        const { organizationUuid } = await this.authorize(account, 'manage');
        const departmentUuid = toUuid(rawDepartmentUuid, 'Department');
        const groupUuids = toUuidList(rawGroupUuids, 'Group');
        try {
            return await this.departmentModel.setGroupLinks(
                organizationUuid,
                departmentUuid,
                groupUuids,
            );
        } finally {
            this.invalidateSnapshot(organizationUuid);
        }
    }

    async setMembers(
        account: Account,
        rawDepartmentUuid: string,
        rawUserUuids: string[],
    ): Promise<Department> {
        const { organizationUuid } = await this.authorize(account, 'manage');
        const departmentUuid = toUuid(rawDepartmentUuid, 'Department');
        const userUuids = toUuidList(rawUserUuids, 'User');
        try {
            return await this.departmentModel.setMembers(
                organizationUuid,
                departmentUuid,
                userUuids,
            );
        } finally {
            this.invalidateSnapshot(organizationUuid);
        }
    }

    async setOwners(
        account: Account,
        rawDepartmentUuid: string,
        rawOwners: DepartmentOwnerInput[],
    ): Promise<Department> {
        const { organizationUuid } = await this.authorize(account, 'manage');
        const departmentUuid = toUuid(rawDepartmentUuid, 'Department');
        const owners = toOwners(rawOwners);
        try {
            return await this.departmentModel.setOwners(
                organizationUuid,
                departmentUuid,
                owners,
            );
        } finally {
            this.invalidateSnapshot(organizationUuid);
        }
    }

    // null clears it, so the person counts in every department they are in
    async setPrimaryDepartment(
        account: Account,
        rawUserUuid: string,
        data: SetPrimaryDepartment,
    ): Promise<void> {
        const { organizationUuid } = await this.authorize(account, 'manage');
        const userUuid = toUuid(rawUserUuid, 'User');
        const departmentUuid =
            data.departmentUuid === null
                ? null
                : toUuid(data.departmentUuid, 'Department');
        if (departmentUuid !== null) {
            const person = (
                await this.resolveMembership(organizationUuid)
            ).find((m) => m.userUuid === userUuid);
            if (!person) {
                throw new NotFoundError(notAnActiveMemberMessage(userUuid));
            }
            if (
                !person.placements.some(
                    (p) => p.departmentUuid === departmentUuid,
                )
            ) {
                throw new ParameterError(
                    `User ${userUuid} is not in department ${departmentUuid}`,
                );
            }
        }
        try {
            await this.departmentModel.setPrimaryDepartment(
                organizationUuid,
                userUuid,
                departmentUuid,
            );
        } finally {
            this.invalidateSnapshot(organizationUuid);
        }
    }
}
