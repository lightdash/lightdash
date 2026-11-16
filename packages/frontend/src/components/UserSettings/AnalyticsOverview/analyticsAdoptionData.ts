import {
    FilterOperator,
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
export const adoptionActivityQuery = adoptionQuery('people_adoption', [
    ...groupsAndRole,
    'parts_used',
]);

// These positions match the feature bits of the people_adoption Explore.
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

type Group = { id: string; name: string };
type Population = {
    total: number;
    roles: number[];
    featureCounts: number[];
    featuresPerPerson: number[];
};

const emptyPopulation = (): Population => ({
    total: 0,
    roles: adoptionRoles.map(() => 0),
    featureCounts: adoptionFeatures.map(() => 0),
    featuresPerPerson: Array.from(
        { length: adoptionFeatures.length + 1 },
        () => 0,
    ),
});

const noGroup = { id: 'no-group', name: 'No group' };

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

export const summarizeAdoption = (rows: RawResultRow[], explore: string) => {
    const overall = emptyPopulation();
    const groups = new Map<string, Group & Population>();
    for (const row of rows) {
        const read = (field: string) => row[`${explore}_${field}`];
        const count = Number(read('total_members'));
        if (!Number.isFinite(count) || count < 1) continue;

        const role = roleIndex(read('organization_role'));
        const mask = Number(read('parts_used') ?? 0);
        const used = adoptionFeatures.map(
            (_, index) => (mask & (1 << index)) !== 0,
        );
        const numberUsed = used.filter(Boolean).length;
        const accumulate = (population: Population) => {
            population.total += count;
            population.roles[role] += count;
            population.featuresPerPerson[numberUsed] += count;
            used.forEach((included, index) => {
                if (included) population.featureCounts[index] += count;
            });
        };

        // Each source row represents distinct people; groups can overlap.
        accumulate(overall);
        const ids = parseList(read('group_ids'));
        const names = parseList(read('group_names'));
        const memberships = ids.length
            ? ids.map((id, index) => ({ id, name: names[index] || id }))
            : [noGroup];
        const seen = new Set<string>();
        for (const membership of memberships) {
            if (seen.has(membership.id)) continue;
            seen.add(membership.id);
            const group = groups.get(membership.id) ?? {
                ...membership,
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
