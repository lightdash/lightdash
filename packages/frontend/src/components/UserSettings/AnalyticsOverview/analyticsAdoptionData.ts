import {
    BinType,
    CustomDimensionType,
    FilterOperator,
    GroupValueMatchType,
    type AnalyticsAdoptionTeamConfig,
    type MetricQuery,
    type RawResultRow,
} from '@lightdash/common';

export const ADOPTION_ROW_LIMIT = 5000;

const adoptionQuery = (explore: string, fields: string[]): MetricQuery => ({
    exploreName: explore,
    dimensions: fields.map((field) => `${explore}_${field}`),
    metrics: [`${explore}_total_members`],
    filters: {
        dimensions: {
            id: 'analytics-adoption',
            and: [
                {
                    id: 'active-members',
                    target: { fieldId: `${explore}_is_active` },
                    operator: FilterOperator.EQUALS,
                    values: [true],
                },
            ],
        },
    },
    sorts: [],
    limit: ADOPTION_ROW_LIMIT,
    tableCalculations: [],
    timezone: 'UTC',
});

const groupsAndRole = ['group_ids', 'group_names', 'organization_role'];

export const adoptionMembershipQuery = adoptionQuery(
    'people_membership',
    groupsAndRole,
);
export const adoptionActivityQuery = adoptionQuery('people_adoption_details', [
    ...groupsAndRole,
    'parts_used',
    'last_seen',
    'flow_bits',
]);

const ASSIGNED_MEMBER = 'adoption_assigned_member';

export const withAdoptionMembers = (
    query: MetricQuery,
    config: AnalyticsAdoptionTeamConfig,
): MetricQuery => {
    const ids = [
        ...new Set([
            ...Object.keys(config.primary),
            ...(config.teams?.flatMap(({ memberIds }) => memberIds) ?? []),
        ]),
    ].sort();
    if (!ids.length) return query;

    // Only configured people get their own bucket; everyone else stays grouped.
    return {
        ...query,
        dimensions: [...query.dimensions, ASSIGNED_MEMBER],
        customDimensions: [
            {
                id: ASSIGNED_MEMBER,
                name: 'Assigned member',
                table: query.exploreName,
                dimensionId: `${query.exploreName}_user_id`,
                type: CustomDimensionType.BIN,
                binType: BinType.CUSTOM_GROUP,
                customGroups: ids.map((id) => ({
                    name: id,
                    values: [
                        { matchType: GroupValueMatchType.EXACT, value: id },
                    ],
                })),
            },
        ],
    };
};

// These positions match the feature bits of the people_adoption_details Explore.
export const adoptionFeatures = [
    'Dashboards',
    'Charts',
    'Explore & SQL',
    'Ask AI',
    'MCP',
    'App views',
    'App builds',
    'Downloads',
] as const;

export const adoptionRoles = [
    { label: 'Admin', color: 'violet' },
    { label: 'Editor', color: 'blue' },
    { label: 'Interactive viewer', color: 'teal' },
    { label: 'Viewer', color: 'gray' },
] as const;

export const adoptionRecency = [
    { label: 'Last 7 days', color: 'green', value: 'd7' },
    { label: '8–30 days ago', color: 'teal', value: 'd30' },
    { label: 'Over 30 days ago', color: 'blue', value: 'older' },
    { label: 'No recorded activity', color: 'gray', value: 'never' },
] as const;

export const adoptionGrowth = [
    { label: 'Stayed active', color: 'teal' },
    { label: 'Newly active', color: 'green' },
    { label: 'Returned', color: 'blue' },
    { label: 'Recently inactive', color: 'orange' },
    { label: 'Lapsed', color: 'pink' },
    { label: 'No recorded usage', color: 'gray' },
] as const;

export const UNGROUPED = 'no-group';

const growthIndex = (bits: number) => {
    if (bits & 1) {
        if (bits & 2) return 0;
        return bits & 4 ? 2 : 1;
    }
    if (bits & 2) return 3;
    return bits & 4 ? 4 : 5;
};

type Group = { id: string; name: string };
type Population = {
    total: number;
    roles: number[];
    recency: number[];
    growth: number[];
    featureCounts: number[];
    featuresPerPerson: number[];
};

const emptyPopulation = (): Population => ({
    total: 0,
    roles: adoptionRoles.map(() => 0),
    recency: adoptionRecency.map(() => 0),
    growth: adoptionGrowth.map(() => 0),
    featureCounts: adoptionFeatures.map(() => 0),
    featuresPerPerson: Array.from(
        { length: adoptionFeatures.length + 1 },
        () => 0,
    ),
});

const noGroup = { id: UNGROUPED, name: 'No group' };

const parseList = (value: unknown): string[] => {
    if (typeof value !== 'string') return [];
    try {
        const items: unknown = JSON.parse(value);
        return Array.isArray(items) ? items.map((item) => String(item)) : [];
    } catch {
        return [];
    }
};

const roleIndex = (role: unknown) => {
    switch (role) {
        case 'admin':
            return 0;
        case 'editor':
        case 'developer':
            return 1;
        case 'interactive_viewer':
            return 2;
        default:
            return 3;
    }
};

export const summarizeAdoption = (
    rows: RawResultRow[],
    explore: string,
    features = new Set<string>(adoptionFeatures),
    config?: AnalyticsAdoptionTeamConfig,
) => {
    const overall = emptyPopulation();
    const groups = new Map<string, Group & Population>();
    const teamsByGroup = new Map<string, Group[]>();
    const teamsByMember = new Map<string, Group[]>();
    for (const team of config?.teams ?? []) {
        for (const id of team.groupIds) {
            teamsByGroup.set(id, [...(teamsByGroup.get(id) ?? []), team]);
        }
        for (const id of team.memberIds) {
            teamsByMember.set(id, [...(teamsByMember.get(id) ?? []), team]);
        }
    }
    for (const row of rows) {
        const read = (field: string) => row[`${explore}_${field}`];
        const count = Number(read('total_members'));
        if (!Number.isFinite(count) || count < 1) continue;

        const role = roleIndex(read('organization_role'));
        const mask = Number(read('parts_used') ?? 0);
        const used = adoptionFeatures.map(
            (_, index) => (mask & (1 << index)) !== 0,
        );
        const numberUsed = adoptionFeatures.filter(
            (feature, index) => used[index] && features.has(feature),
        ).length;
        const recency = adoptionRecency.findIndex(
            ({ value }) => value === read('last_seen'),
        );
        const growth = growthIndex(Number(read('flow_bits') ?? 0));
        const accumulate = (population: Population) => {
            population.total += count;
            population.roles[role] += count;
            population.recency[
                recency === -1 ? adoptionRecency.length - 1 : recency
            ] += count;
            population.growth[growth] += count;
            population.featuresPerPerson[numberUsed] += count;
            used.forEach((included, index) => {
                if (included) population.featureCounts[index] += count;
            });
        };

        // Each source row represents distinct people; groups can overlap.
        accumulate(overall);
        const ids = parseList(read('group_ids'));
        const names = parseList(read('group_names'));
        const memberId = row[ASSIGNED_MEMBER];
        let memberships = ids.map((id, index) => ({
            id,
            name: names[index] || id,
        }));
        if (config?.teams) {
            memberships = ids.flatMap((id) => teamsByGroup.get(id) ?? []);
            if (typeof memberId === 'string') {
                memberships.push(...(teamsByMember.get(memberId) ?? []));
                const primary = config.primary[memberId];
                const primaryTeam = memberships.find(
                    ({ id }) => id === primary,
                );
                if (primaryTeam) memberships = [primaryTeam];
            }
        }
        const unassigned = config?.teams
            ? { ...noGroup, name: 'No team' }
            : noGroup;
        const seen = new Set<string>();
        for (const membership of memberships.length
            ? memberships
            : [unassigned]) {
            if (seen.has(membership.id)) continue;
            seen.add(membership.id);
            const group = groups.get(membership.id) ?? {
                id: membership.id,
                name: membership.name,
                ...emptyPopulation(),
            };
            accumulate(group);
            groups.set(group.id, group);
        }
    }
    return {
        overall,
        groups: [...groups.values()].sort(
            (a, b) => b.total - a.total || a.name.localeCompare(b.name),
        ),
    };
};

export type AdoptionData = ReturnType<typeof summarizeAdoption>;
