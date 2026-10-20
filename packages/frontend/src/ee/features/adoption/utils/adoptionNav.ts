export const ADOPTION_PATH = '/generalSettings/adoption';

export const ADOPTION_NAV_KEYWORDS = [
    'adoption',
    'department',
    'departments',
    'headcount',
    'rollout',
    'usage',
];

export const getDepartmentPath = (departmentUuid: string): string =>
    `${ADOPTION_PATH}/${departmentUuid}`;

export type AdoptionView = 'map' | 'list';

// The first entry is the default view
export const ADOPTION_VIEWS: AdoptionView[] = ['list'];

export const ADOPTION_VIEW_LABELS: Record<AdoptionView, string> = {
    map: 'Map',
    list: 'List',
};

export const parseAdoptionView = (
    value: string | null,
    available: AdoptionView[] = ADOPTION_VIEWS,
): AdoptionView => available.find((view) => view === value) ?? available[0];
