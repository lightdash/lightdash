export const ADOPTION_PATH = '/generalSettings/adoption';

export const ADOPTION_NAV_KEYWORDS = [
    'adoption',
    'department',
    'departments',
    'headcount',
    'rollout',
    'usage',
];

// The page's query string names the view shown and the department selected
export const VIEW_PARAM = 'view';
const DEPARTMENT_PARAM = 'department';

// An empty value selects nothing
export const getSelectedDepartment = (
    params: URLSearchParams,
): string | null => {
    const value = params.get(DEPARTMENT_PARAM);
    return value === null || value === '' ? null : value;
};

// The same query string with a department selected, or none; the view and anything else are kept
export const withSelectedDepartment = (
    params: URLSearchParams,
    departmentUuid: string | null,
): URLSearchParams => {
    const next = new URLSearchParams(params);
    if (departmentUuid === null) next.delete(DEPARTMENT_PARAM);
    else next.set(DEPARTMENT_PARAM, departmentUuid);
    return next;
};

// The page with a department selected, whatever the value; the page checks it is a uuid before asking for it
export const getDepartmentPath = (departmentUuid: string): string =>
    `${ADOPTION_PATH}?${withSelectedDepartment(new URLSearchParams(), departmentUuid).toString()}`;

export type AdoptionView = 'map' | 'list' | 'waffle';

// The first entry is the default view
export const ADOPTION_VIEWS: AdoptionView[] = ['map', 'list', 'waffle'];

export const ADOPTION_VIEW_LABELS: Record<AdoptionView, string> = {
    map: 'Map',
    list: 'List',
    waffle: 'Waffle',
};

export const parseAdoptionView = (
    value: string | null,
    available: AdoptionView[] = ADOPTION_VIEWS,
): AdoptionView => available.find((view) => view === value) ?? available[0];
