import {
    type AdoptionMetrics,
    type DepartmentDetail,
    type DepartmentMember,
    type DepartmentOverlaps,
    type DepartmentWithMetrics,
} from '@lightdash/common';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { type ColourBy } from '../map/geometry';
import { DotSwatch } from '../map/MapLegend';
import {
    dept,
    memberFixture,
    metricsFixture,
    withServerHeadcounts,
} from '../utils/adoptionFixtures';
import {
    type PersonHighlight,
    type WeeklyComparisonPoint,
} from '../utils/departmentDetail';
import { SelectedDepartment } from './SelectedDepartment';

const COMPANY = '00000000-2222-4333-8444-555555555555';
const DATA = '11111111-2222-4333-8444-555555555555';
const SCIENCE = '44444444-2222-4333-8444-555555555555';
const ENGINEERING = '55555555-2222-4333-8444-555555555555';
const MARKETING = '22222222-2222-4333-8444-555555555555';
const SALES = '33333333-2222-4333-8444-555555555555';

const detail = vi.fn();
const overlaps = vi.fn();
const chartWeeks = vi.fn();
vi.mock('../../../hooks/useOrgDepartments', () => ({
    useDepartmentDetail: (departmentUuid: string | undefined) =>
        detail(departmentUuid),
    useDepartmentOverlaps: (
        departmentUuid: string | undefined,
        withUuids: string[] = [],
        withoutUuids: string[] = [],
    ) => overlaps(departmentUuid, withUuids, withoutUuids),
}));
vi.mock('./WeeklyActiveChart', () => ({
    WeeklyActiveChart: ({ weeks }: { weeks: WeeklyComparisonPoint[] }) => {
        chartWeeks(weeks);
        return <div data-testid="weekly-chart" />;
    },
}));

const WEEK_STARTS = ['2026-09-21', '2026-09-28', '2026-10-05'];
const weekly = (counts: number[]) =>
    WEEK_STARTS.map((weekStart, i) => ({
        weekStart,
        activeUsers: counts[i],
    }));

// 1,000, 500 and 250 of 2,000 people on Lightdash active in the three weeks
const organization: AdoptionMetrics = metricsFixture(2000, null, {
    weeklyActive: weekly([1000, 500, 250]),
});

// Data under Company: a headcount of 194, 191 of them on Lightdash and 85 active, in Science (9 of 12), Engineering
// (33 of 33) and directly in Data (149 of the 149 it keeps for them)
const departmentDetail = (
    over: Partial<DepartmentWithMetrics> = {},
): DepartmentDetail => {
    const [data, science, engineering] = withServerHeadcounts([
        dept('Data', null, null, {
            departmentUuid: DATA,
            parentDepartmentUuid: COMPANY,
            headcount: 194,
            metrics: metricsFixture(191, 100, {
                activeCount30d: 85,
                activePct: 45,
                activitySplit: { healthy: 85, atRisk: 30, lost: 76 },
                roleSplit: {
                    viewers: 129,
                    interactiveViewers: 40,
                    editors: 20,
                    admins: 2,
                },
                weeklyActive: weekly([50, 60, 40]),
            }),
            directMetrics: metricsFixture(149, null, { activeCount30d: 40 }),
        }),
        dept('Science', DATA, null, {
            departmentUuid: SCIENCE,
            headcount: 12,
            metrics: metricsFixture(9, 75, { activeCount30d: 9 }),
        }),
        dept('Engineering', DATA, null, {
            departmentUuid: ENGINEERING,
            headcount: 33,
            metrics: metricsFixture(33, 100, { activeCount30d: 20 }),
        }),
    ]);
    return {
        department: { ...data, ...over },
        ancestors: [{ departmentUuid: COMPANY, name: 'Company' }],
        children: [science, engineering],
        targetProgress: null,
        weeklyActive: data.metrics.weeklyActive.map((point) => ({
            ...point,
            orgAverage: 12,
        })),
        topContent: { dashboards: [], explores: [], aiAgents: [] },
        members: [],
    };
};

// Science alone: a department with no sub-departments
const leafDetail = (): DepartmentDetail => {
    const parent = departmentDetail();
    return {
        ...parent,
        department: parent.children[0],
        ancestors: [
            { departmentUuid: COMPANY, name: 'Company' },
            { departmentUuid: DATA, name: 'Data' },
        ],
        children: [],
    };
};

// A query that has answered, with a department or with its overlaps
const loaded = <T extends DepartmentDetail | DepartmentOverlaps>(data: T) => ({
    isInitialLoading: false,
    isError: false,
    data,
    error: null,
});
const failure = (statusCode: number) => ({
    isInitialLoading: false,
    isError: true,
    data: undefined,
    error: { error: { statusCode, message: 'nope' } },
});
// What a query answers before it is enabled, and while it loads
const idle = { isInitialLoading: false, isError: false, data: undefined };
const pending = { isInitialLoading: true, isError: false, data: undefined };

// Ann is also in Marketing, Bob in Marketing and Sales, Cat only here
const PEOPLE: DepartmentMember[] = [
    memberFixture('ann', null, {
        departmentUuid: DATA,
        departmentName: 'Data',
        sharedWith: [{ departmentUuid: MARKETING, name: 'Marketing' }],
    }),
    memberFixture('bob', null, {
        departmentUuid: DATA,
        departmentName: 'Data',
        sharedWith: [
            { departmentUuid: MARKETING, name: 'Marketing' },
            { departmentUuid: SALES, name: 'Sales' },
        ],
    }),
    memberFixture('cat', null, {
        departmentUuid: DATA,
        departmentName: 'Data',
    }),
];
const MEMBERS_IN: Record<string, string[]> = {
    [MARKETING]: ['ann', 'bob'],
    [SALES]: ['bob'],
};

const departmentOverlaps = (): DepartmentOverlaps => ({
    department: { departmentUuid: DATA, name: 'Data' },
    overlaps: [
        {
            departmentUuid: MARKETING,
            name: 'Marketing',
            people: 2,
            active30d: 0,
        },
        { departmentUuid: SALES, name: 'Sales', people: 1, active30d: 0 },
    ],
    venn: {
        sets: [
            { departmentUuid: DATA, name: 'Data' },
            { departmentUuid: MARKETING, name: 'Marketing' },
            { departmentUuid: SALES, name: 'Sales' },
        ],
        regions: [
            { sets: [DATA], people: 1, active30d: 0 },
            { sets: [MARKETING], people: 40, active30d: 0 },
            { sets: [SALES], people: 30, active30d: 0 },
            { sets: [DATA, MARKETING], people: 1, active30d: 0 },
            { sets: [DATA, SALES], people: 0, active30d: 0 },
            { sets: [MARKETING, SALES], people: 2, active30d: 0 },
            { sets: [DATA, MARKETING, SALES], people: 1, active30d: 0 },
        ],
    },
    members: null,
});

// Like the server: no lists, no people; otherwise the department's people in every "with" and in no "without"
const answerOverlaps = (
    departmentUuid: string | undefined,
    withUuids: string[],
    withoutUuids: string[],
) => {
    if (departmentUuid === undefined) return idle;
    const isIn = (member: DepartmentMember, uuid: string) =>
        (MEMBERS_IN[uuid] ?? []).includes(member.userUuid);
    return loaded({
        ...departmentOverlaps(),
        members:
            withUuids.length === 0 && withoutUuids.length === 0
                ? null
                : PEOPLE.filter(
                      (member) =>
                          withUuids.every((uuid) => isIn(member, uuid)) &&
                          !withoutUuids.some((uuid) => isIn(member, uuid)),
                  ),
    });
};

type RenderOptions = {
    departmentUuid?: string;
    canManage?: boolean;
    colourBy?: ColourBy;
    isDeleting?: boolean;
    highlight?: PersonHighlight | null;
};

const renderDetail = ({
    departmentUuid = DATA,
    canManage = false,
    colourBy = 'activity',
    isDeleting = false,
    highlight = null,
}: RenderOptions = {}) => {
    const onSelect = vi.fn();
    const onEdit = vi.fn();
    const onPlacePeople = vi.fn();
    const element = (picked: PersonHighlight | null) => (
        <MemoryRouter
            initialEntries={[
                `/generalSettings/adoption?view=map&department=${departmentUuid}`,
            ]}
        >
            <SelectedDepartment
                departmentUuid={departmentUuid}
                organization={organization}
                colourBy={colourBy}
                keySwatch={DotSwatch}
                canManage={canManage}
                isDeleting={isDeleting}
                highlight={picked}
                onSelect={onSelect}
                onEdit={onEdit}
                onPlacePeople={onPlacePeople}
            />
        </MemoryRouter>
    );
    const { rerender } = renderWithProviders(element(highlight));
    // The same department with a person picked on the map
    const pick = (picked: PersonHighlight) => rerender(element(picked));
    return { onSelect, onEdit, onPlacePeople, pick };
};

// The emails of the people listed, in order
const peopleShown = () =>
    within(
        screen.getByRole('table', {
            name: (_name, element) =>
                element.querySelector('th')?.textContent === 'Person',
        }),
    )
        .getAllByRole('row')
        .slice(1)
        .map((row) => within(row).getByText(/@example\.com$/).textContent);

// The department's own bar, the first drawn, as its parts in order and the share of the bar each takes; the rest is
// its track, the people without an account
const mainBar = () =>
    [
        ...(document.querySelector('[data-part]')?.parentElement?.children ??
            []),
    ] as HTMLElement[];
const barOf = (parts: HTMLElement[]) =>
    parts.map((part) => [
        part.dataset.part,
        Math.round(
            Number.parseFloat(
                part.style.getPropertyValue('--progress-section-size'),
            ),
        ),
    ]);
const legendLines = () =>
    screen
        .getAllByText(
            /^(Healthy|At risk|Lost|Admin|Editor|Interactive viewer|Viewer|No account) [\d,]+$/,
        )
        .map((node) => node.textContent);
// The sub-departments as their names and their last column
const subDepartmentRows = () => {
    const heading = screen.getByRole('heading', { name: 'Sub-departments' });
    return [
        ...(heading.nextElementSibling?.firstElementChild?.children ?? []),
    ].map((row) =>
        [...row.children]
            .map((cell) => cell.textContent)
            .filter(Boolean)
            .join(' | '),
    );
};

describe('SelectedDepartment', () => {
    beforeEach(() => {
        detail.mockReset();
        chartWeeks.mockReset();
        overlaps.mockReset();
        overlaps.mockReturnValue(idle);
    });

    describe('while it cannot be shown', () => {
        it('says the department was not found on a 404, with a way back to the organization', async () => {
            detail.mockReturnValue(failure(404));
            const { onSelect } = renderDetail();
            expect(screen.getByText('Department not found')).toBeVisible();
            await userEvent.click(
                screen.getByRole('button', { name: 'Back to organization' }),
            );
            expect(onSelect).toHaveBeenCalledWith(null);
        });

        it('says there is no access on a 403', () => {
            detail.mockReturnValue(failure(403));
            renderDetail();
            expect(
                screen.getByText("You don't have access to this department"),
            ).toBeVisible();
            expect(
                screen.getByRole('button', { name: 'Back to organization' }),
            ).toBeVisible();
        });

        it('says it is loading until the department arrives', () => {
            detail.mockReturnValue({
                isInitialLoading: true,
                isError: false,
                data: undefined,
            });
            renderDetail();
            expect(screen.getByText('Loading department')).toBeVisible();
            expect(detail).toHaveBeenCalledWith(DATA);
        });

        it.each([
            ['a word', 'ops'],
            ['an encoded path that climbs out', '../../user'],
            ['the membership route', 'membership'],
            ['a uuid with something after it', `${DATA}x`],
        ])('shows not found for %s and requests nothing', (_label, value) => {
            detail.mockReturnValue({
                isInitialLoading: false,
                isError: false,
                data: undefined,
            });
            renderDetail({ departmentUuid: value });
            expect(screen.getByText('Department not found')).toBeVisible();
            detail.mock.calls.forEach(([departmentUuid]) =>
                expect(departmentUuid).toBeUndefined(),
            );
        });

        it('keeps what it showed while its delete is in flight', () => {
            detail.mockReturnValue({
                ...failure(404),
                data: departmentDetail(),
            });
            renderDetail({ isDeleting: true });
            expect(
                screen.getByRole('heading', { name: 'Data' }),
            ).toBeInTheDocument();
            expect(screen.queryByText('Department not found')).toBeNull();
        });
    });

    describe('its header', () => {
        it('names where it sits, each level a link that selects it, and takes focus on its name', () => {
            detail.mockReturnValue(loaded(departmentDetail()));
            renderDetail();
            const crumbs = screen.getByRole('navigation', {
                name: 'Selected department',
            });
            expect(
                within(crumbs).getByRole('link', { name: 'Organization' }),
            ).toHaveAttribute('href', '/generalSettings/adoption?view=map');
            expect(
                within(crumbs).getByRole('link', { name: 'Company' }),
            ).toHaveAttribute(
                'href',
                `/generalSettings/adoption?view=map&department=${COMPANY}`,
            );
            expect(
                within(crumbs).getByText('Data', {
                    selector: '[aria-current="location"]',
                }),
            ).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: 'Data' })).toHaveFocus();
        });

        it('shows its owners as chips', () => {
            detail.mockReturnValue(
                loaded(
                    departmentDetail({
                        owners: [
                            { type: 'user', uuid: 'u1', name: 'Ada Owner' },
                            { type: 'group', uuid: 'g1', name: 'Data leads' },
                        ],
                    }),
                ),
            );
            renderDetail();
            expect(
                within(screen.getByRole('list', { name: 'Owners' }))
                    .getAllByRole('listitem')
                    .map((owner) => owner.textContent),
            ).toEqual(['Ada Owner', 'Data leads']);
        });

        it('has no owners line for a department without owners', () => {
            detail.mockReturnValue(loaded(departmentDetail()));
            renderDetail();
            expect(screen.queryByRole('list', { name: 'Owners' })).toBeNull();
        });

        it('offers Edit department and Place people to people who can manage departments', async () => {
            detail.mockReturnValue(loaded(departmentDetail()));
            const { onEdit, onPlacePeople } = renderDetail({ canManage: true });
            await userEvent.click(
                screen.getByRole('button', { name: 'Edit department' }),
            );
            expect(onEdit).toHaveBeenCalledWith(
                expect.objectContaining({ departmentUuid: DATA }),
            );
            await userEvent.click(
                screen.getByRole('button', { name: 'Place people' }),
            );
            expect(onPlacePeople).toHaveBeenCalledOnce();
        });

        it('offers neither to anyone else', () => {
            detail.mockReturnValue(loaded(departmentDetail()));
            renderDetail();
            expect(
                screen.queryByRole('button', { name: 'Edit department' }),
            ).toBeNull();
            expect(
                screen.queryByRole('button', { name: 'Place people' }),
            ).toBeNull();
        });

        it('warns when the headcount entered is below its sub-departments and its own people', () => {
            detail.mockReturnValue(
                loaded(departmentDetail({ headcountBelowChildren: true })),
            );
            renderDetail();
            expect(
                screen.getByText(
                    'The headcount entered is below its sub-departments and its own people, so that total counts instead',
                ),
            ).toBeVisible();
        });
    });

    describe('its people', () => {
        it('splits its bar by activity over its headcount, keys it with the marks of the view, and gives its numbers on one line', () => {
            detail.mockReturnValue(loaded(departmentDetail()));
            renderDetail();
            expect(barOf(mainBar())).toEqual([
                ['healthy', 44],
                ['atRisk', 15],
                ['lost', 39],
            ]);
            expect(legendLines()).toEqual([
                'Healthy 85',
                'At risk 30',
                'Lost 76',
                'No account 3',
            ]);
            expect(
                [...document.body.querySelectorAll('li [data-dot]')].map(
                    (dot) => dot.getAttribute('data-dot'),
                ),
            ).toEqual(['healthy', 'atRisk', 'lost', 'noAccount']);
            expect(
                screen.getByText(
                    '191 of 194 on Lightdash · 85 active in 30 days · 3 without an account',
                ),
            ).toBeVisible();
            // The numbers are a line and a bar, not tiles
            expect(
                screen.queryByRole('group', { name: 'Coverage' }),
            ).toBeNull();
        });

        it('shows no target, even when one is set', () => {
            detail.mockReturnValue(
                loaded({
                    ...departmentDetail({
                        targetActiveUsers: 120,
                        targetDate: '2026-12-31',
                    }),
                    targetProgress: {
                        targetActiveUsers: 120,
                        targetDate: '2026-12-31',
                        activeUsers: 85,
                        remaining: 35,
                        weeksLeft: 12,
                    },
                }),
            );
            renderDetail();
            expect(screen.queryByText(/target|to go/i)).toBeNull();
        });

        it('splits its bar by role when the view is coloured by role', () => {
            detail.mockReturnValue(loaded(departmentDetail()));
            renderDetail({ colourBy: 'role' });
            expect(legendLines()).toEqual([
                'Admin 2',
                'Editor 20',
                'Interactive viewer 40',
                'Viewer 129',
                'No account 3',
            ]);
        });

        it('counts the people without an account where some of its headcount has none', () => {
            detail.mockReturnValue(
                loaded(
                    departmentDetail({
                        effectiveHeadcount: 420,
                        metrics: metricsFixture(187, 45, {
                            activeCount30d: 115,
                        }),
                    }),
                ),
            );
            renderDetail();
            expect(
                screen.getByText(
                    '187 of 420 on Lightdash · 115 active in 30 days · 233 without an account',
                ),
            ).toBeVisible();
            expect(legendLines()).toContain('No account 233');
        });

        it('asks for headcounts in place of the people without an account where none is entered on it or below it', () => {
            detail.mockReturnValue(
                loaded(
                    departmentDetail({ headcount: null, hasHeadcount: false }),
                ),
            );
            renderDetail();
            expect(
                screen.getByText('Add headcounts to see coverage'),
            ).toBeVisible();
            expect(legendLines()).toEqual([
                'Healthy 85',
                'At risk 30',
                'Lost 76',
            ]);
            expect(
                screen.getByText('191 on Lightdash · 85 active in 30 days'),
            ).toBeVisible();
        });

        it("compares each week with the organization's rate applied to this department", () => {
            detail.mockReturnValue(loaded(departmentDetail()));
            renderDetail();
            // 1,000, 500 and 250 of 2,000 active, applied to the 191 on Lightdash
            expect(chartWeeks).toHaveBeenLastCalledWith([
                { weekStart: '2026-09-21', activeUsers: 50, atOrgRate: 95.5 },
                { weekStart: '2026-09-28', activeUsers: 60, atOrgRate: 47.8 },
                { weekStart: '2026-10-05', activeUsers: 40, atOrgRate: 23.9 },
            ]);
            expect(
                screen.getByRole('heading', { name: 'Weekly active people' }),
            ).toBeVisible();
            expect(
                screen.queryByText('No comparison: nobody on Lightdash yet'),
            ).toBeNull();
        });

        it('draws no comparison for a department with nobody on Lightdash, and says why', () => {
            const nobody = metricsFixture(0, 0, {
                weeklyActive: weekly([0, 0, 0]),
            });
            const empty = departmentDetail({ metrics: nobody });
            detail.mockReturnValue(
                loaded({
                    ...empty,
                    weeklyActive: nobody.weeklyActive.map((point) => ({
                        ...point,
                        orgAverage: 12,
                    })),
                }),
            );
            renderDetail();
            expect(chartWeeks).toHaveBeenLastCalledWith(
                WEEK_STARTS.map((weekStart) => ({
                    weekStart,
                    activeUsers: 0,
                    atOrgRate: null,
                })),
            );
            expect(
                screen.getByText('No comparison: nobody on Lightdash yet'),
            ).toBeVisible();
        });
    });

    describe('its sub-departments', () => {
        it('lists them lowest coverage first with the people directly in it last, and a row selects its department', async () => {
            detail.mockReturnValue(loaded(departmentDetail()));
            const { onSelect } = renderDetail();
            expect(subDepartmentRows()).toEqual([
                'Science | 75%',
                'Engineering | 100%',
                'Directly in Data · 149 | 100%',
            ]);
            await userEvent.click(
                screen.getByRole('button', { name: /^Science/ }),
            );
            expect(onSelect).toHaveBeenCalledWith(SCIENCE);
            // The people directly in it are the department selected, so their row selects nothing
            expect(
                screen.getByTitle('Directly in Data · 149').closest('button'),
            ).toBeNull();
        });

        it('asks for a headcount in a row with none, or says there is none to people who cannot edit', () => {
            const withNone = departmentDetail();
            detail.mockReturnValue(
                loaded({
                    ...withNone,
                    children: withNone.children.map((child) =>
                        child.departmentUuid === SCIENCE
                            ? { ...child, headcount: null, hasHeadcount: false }
                            : child,
                    ),
                }),
            );
            renderDetail({ canManage: true });
            expect(subDepartmentRows()).toContain('Science | Add headcount');
        });

        it('says there is no headcount in a row with none to people who cannot edit departments', () => {
            const withNone = departmentDetail();
            detail.mockReturnValue(
                loaded({
                    ...withNone,
                    children: withNone.children.map((child) =>
                        child.departmentUuid === SCIENCE
                            ? { ...child, headcount: null, hasHeadcount: false }
                            : child,
                    ),
                }),
            );
            renderDetail();
            expect(subDepartmentRows()).toContain('Science | No headcount');
            expect(screen.queryByText('Add headcount')).toBeNull();
        });

        it('never reads above 100% for a department with more people on Lightdash than its headcount', () => {
            // A headcount of 8 entered for 9 people on Lightdash, all active, counts 9
            const [over] = withServerHeadcounts([
                dept('Data', null, null, {
                    departmentUuid: DATA,
                    headcount: 8,
                    metrics: metricsFixture(9, 100, {
                        activeCount30d: 9,
                        activePct: 100,
                    }),
                }),
            ]);
            detail.mockReturnValue(
                loaded({
                    ...departmentDetail(),
                    department: over,
                    children: [],
                }),
            );
            renderDetail();
            expect(barOf(mainBar())).toEqual([
                ['healthy', 100],
                ['atRisk', 0],
                ['lost', 0],
            ]);
            expect(legendLines()).toContain('No account 0');
            expect(
                screen.getByText('9 of 9 on Lightdash · 9 active in 30 days'),
            ).toBeVisible();
        });

        it('has none for a department without sub-departments, nor a row of people directly in it', () => {
            detail.mockReturnValue(loaded(leafDetail()));
            renderDetail({ departmentUuid: SCIENCE });
            expect(
                screen.getByRole('heading', { name: 'Science' }),
            ).toBeInTheDocument();
            expect(
                screen.queryByRole('heading', { name: 'Sub-departments' }),
            ).toBeNull();
            expect(screen.queryByText(/Directly in/)).toBeNull();
            // Its breadcrumb leads back through its parent
            expect(screen.getByRole('link', { name: 'Data' })).toHaveAttribute(
                'href',
                `/generalSettings/adoption?view=map&department=${DATA}`,
            );
        });
    });

    describe('every section', () => {
        // The overlaps of whichever department is asked about, listed without a diagram
        const overlapsOf = (departmentUuid: string, name: string) =>
            loaded({
                ...departmentOverlaps(),
                department: { departmentUuid, name },
                venn: null,
            });

        it.each([
            [
                'a department with sub-departments',
                DATA,
                departmentDetail,
                [
                    'Weekly active people',
                    'Key content',
                    'Overlaps',
                    'Sub-departments',
                    'People',
                ],
            ],
            [
                'a department without any',
                SCIENCE,
                leafDetail,
                ['Weekly active people', 'Key content', 'Overlaps', 'People'],
            ],
        ])('renders for %s', (_label, departmentUuid, build, sections) => {
            const built = build();
            detail.mockReturnValue(loaded({ ...built, members: PEOPLE }));
            overlaps.mockImplementation((asked: string | undefined) =>
                asked === undefined
                    ? idle
                    : overlapsOf(departmentUuid, built.department.name),
            );
            renderDetail({ departmentUuid, canManage: true });
            const name = built.department.name;
            expect(
                screen.getByRole('navigation', {
                    name: 'Selected department',
                }),
            ).toHaveTextContent(name);
            expect(screen.getByRole('heading', { name })).toHaveFocus();
            expect(
                screen.getByRole('button', { name: 'Edit department' }),
            ).toBeInTheDocument();
            expect(mainBar().length).toBeGreaterThan(0);
            expect(legendLines()[0]).toMatch(/^Healthy \d+$/);
            expect(
                screen.getByText(/ on Lightdash · \d+ active in 30 days/),
            ).toBeVisible();
            expect(
                screen
                    .getAllByRole('heading')
                    .map((heading) => heading.textContent)
                    .filter(
                        (title) =>
                            title !== name &&
                            !['Dashboards', 'Explores', 'AI agents'].includes(
                                title ?? '',
                            ),
                    ),
            ).toEqual(sections);
            expect(
                screen.getByRole('button', {
                    name: 'Marketing, 2 people, 0 active',
                }),
            ).toBeVisible();
            expect(peopleShown()).toHaveLength(3);
        });
    });

    describe('what it uses', () => {
        it('lists the key content, each item linked to it', () => {
            const PROJECT = '3675b69e-8324-4110-bdca-059031aa8da3';
            detail.mockReturnValue(
                loaded({
                    ...departmentDetail(),
                    topContent: {
                        dashboards: [
                            {
                                id: 'd1',
                                name: 'Sales',
                                projectUuid: PROJECT,
                                count: 3,
                                distinctPeople: 2,
                            },
                        ],
                        explores: [
                            {
                                id: `${PROJECT}:orders`,
                                name: 'orders',
                                projectUuid: PROJECT,
                                count: 5,
                                distinctPeople: 2,
                            },
                        ],
                        aiAgents: [
                            {
                                id: 'a1',
                                name: 'Analyst',
                                projectUuid: PROJECT,
                                count: 1,
                                distinctPeople: 1,
                            },
                        ],
                    },
                }),
            );
            renderDetail();
            expect(
                screen.getByRole('heading', { name: 'Key content' }),
            ).toBeVisible();
            expect(screen.getByRole('link', { name: 'Sales' })).toHaveAttribute(
                'href',
                `/projects/${PROJECT}/dashboards/d1/view`,
            );
            expect(
                screen.getByRole('link', { name: 'orders' }),
            ).toHaveAttribute('href', `/projects/${PROJECT}/tables/orders`);
            expect(
                screen.getByRole('link', { name: 'Analyst' }),
            ).toHaveAttribute('href', `/projects/${PROJECT}/ai-agents/a1`);
        });
    });

    describe('its overlaps and its people', () => {
        beforeEach(() => {
            detail.mockReturnValue(
                loaded({ ...departmentDetail(), members: PEOPLE }),
            );
            overlaps.mockImplementation(answerOverlaps);
        });

        const SECTIONS = [
            'Weekly active people',
            'Key content',
            'Overlaps',
            'Sub-departments',
            'People',
        ];
        const sectionTitles = () =>
            screen
                .getAllByRole('heading')
                .map((heading) => heading.textContent ?? '')
                .filter((title) => SECTIONS.includes(title));

        it('come in order after its numbers: key content, overlaps, sub-departments and people', () => {
            renderDetail();
            expect(sectionTitles()).toEqual([
                'Weekly active people',
                'Key content',
                'Overlaps',
                'Sub-departments',
                'People',
            ]);
            expect(
                screen.getByRole('group', {
                    name: 'Overlap of Data, Marketing and Sales',
                }),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('button', {
                    name: 'Marketing, 2 people, 0 active',
                }),
            ).toBeVisible();
        });

        it('leave the overlaps out when no department outside this one shares its people', () => {
            overlaps.mockImplementation((departmentUuid: string | undefined) =>
                departmentUuid === undefined
                    ? idle
                    : loaded({
                          ...departmentOverlaps(),
                          overlaps: [],
                          venn: null,
                      }),
            );
            renderDetail();
            expect(sectionTitles()).toEqual([
                'Weekly active people',
                'Key content',
                'Sub-departments',
                'People',
            ]);
        });

        it("ask for this department's overlaps, and for nobody's people until an overlap is chosen", () => {
            renderDetail();
            expect(overlaps).toHaveBeenCalledWith(DATA, [], []);
            expect(overlaps).toHaveBeenCalledWith(undefined, [], []);
            overlaps.mock.calls.forEach((call) =>
                expect([
                    [DATA, [], []],
                    [undefined, [], []],
                ]).toContainEqual(call),
            );
            expect(peopleShown()).toEqual([
                'ann@example.com',
                'bob@example.com',
                'cat@example.com',
            ]);
        });

        it('say which other departments each person is also in', () => {
            renderDetail();
            expect(screen.getByText('Also in Marketing')).toBeVisible();
            expect(
                screen.getByText('Also in Marketing and Sales'),
            ).toBeVisible();
        });

        it('list only the people also in a department chosen, and the chip brings everyone back', async () => {
            renderDetail();
            await userEvent.click(
                screen.getByRole('button', {
                    name: 'Marketing, 2 people, 0 active',
                }),
            );
            expect(overlaps).toHaveBeenLastCalledWith(DATA, [MARKETING], []);
            expect(peopleShown()).toEqual([
                'ann@example.com',
                'bob@example.com',
            ]);
            const clear = screen.getByRole('button', {
                name: 'Clear filter: Also in Marketing',
            });
            expect(clear.parentElement).toHaveTextContent(
                /^Also in Marketing$/,
            );
            await userEvent.click(clear);
            expect(peopleShown()).toEqual([
                'ann@example.com',
                'bob@example.com',
                'cat@example.com',
            ]);
            expect(overlaps).toHaveBeenLastCalledWith(undefined, [], []);
        });

        it('list exactly the people in a region of the diagram chosen', async () => {
            renderDetail();
            await userEvent.click(
                screen.getByRole('button', {
                    name: 'Data and Marketing, 1 person',
                }),
            );
            expect(overlaps).toHaveBeenLastCalledWith(
                DATA,
                [MARKETING],
                [SALES],
            );
            expect(peopleShown()).toEqual(['ann@example.com']);
            expect(
                screen.getByRole('button', {
                    name: 'Clear filter: Also in Marketing, not in Sales',
                }),
            ).toBeVisible();
            await userEvent.click(
                screen.getByRole('button', { name: 'Data only, 1 person' }),
            );
            expect(overlaps).toHaveBeenLastCalledWith(
                DATA,
                [],
                [MARKETING, SALES],
            );
            expect(peopleShown()).toEqual(['cat@example.com']);
            expect(
                screen.getByRole('button', {
                    name: 'Clear filter: Not in Marketing or Sales',
                }),
            ).toBeVisible();
        });

        it('start the people of each overlap on their first page', async () => {
            const many = Array.from({ length: 60 }, (_, i) =>
                memberFixture(`m${String(i).padStart(2, '0')}`, null, {
                    departmentUuid: DATA,
                    departmentName: 'Data',
                }),
            );
            overlaps.mockImplementation(
                (departmentUuid: string | undefined, withUuids: string[]) => {
                    if (departmentUuid === undefined) return idle;
                    const members = withUuids.includes(MARKETING)
                        ? many
                        : withUuids.includes(SALES)
                          ? [PEOPLE[1]]
                          : null;
                    return loaded({ ...departmentOverlaps(), members });
                },
            );
            renderDetail();
            await userEvent.click(
                screen.getByRole('button', {
                    name: 'Marketing, 2 people, 0 active',
                }),
            );
            await userEvent.click(screen.getByRole('button', { name: '2' }));
            expect(peopleShown()).toHaveLength(10);
            await userEvent.click(
                screen.getByRole('button', {
                    name: 'Sales, 1 person, 0 active',
                }),
            );
            expect(peopleShown()).toEqual(['bob@example.com']);
        });

        it('show that the people chosen are loading, and offer a retry when they fail', async () => {
            const refetch = vi.fn();
            overlaps.mockImplementation(
                (departmentUuid: string | undefined, withUuids: string[]) => {
                    if (departmentUuid === undefined) return idle;
                    return withUuids.includes(SALES)
                        ? { ...failure(500), refetch }
                        : withUuids.length > 0
                          ? pending
                          : loaded(departmentOverlaps());
                },
            );
            renderDetail();
            await userEvent.click(
                screen.getByRole('button', {
                    name: 'Marketing, 2 people, 0 active',
                }),
            );
            expect(screen.getByText('Loading people')).toBeVisible();
            expect(
                screen.queryByText('ann@example.com'),
            ).not.toBeInTheDocument();
            await userEvent.click(
                screen.getByRole('button', {
                    name: 'Sales, 1 person, 0 active',
                }),
            );
            expect(
                screen.getByText("These people couldn't be loaded"),
            ).toBeVisible();
            await userEvent.click(
                screen.getByRole('button', { name: 'Retry' }),
            );
            expect(refetch).toHaveBeenCalledOnce();
        });

        it('move keyboard focus to the Overlaps heading when the chip is cleared', async () => {
            renderDetail();
            await userEvent.click(
                screen.getByRole('button', {
                    name: 'Marketing, 2 people, 0 active',
                }),
            );
            const clear = screen.getByRole('button', {
                name: 'Clear filter: Also in Marketing',
            });
            clear.focus();
            await userEvent.keyboard('{Enter}');
            expect(
                screen.queryByRole('button', { name: /^Clear filter/ }),
            ).not.toBeInTheDocument();
            expect(
                screen.getByRole('heading', { name: 'Overlaps' }),
            ).toHaveFocus();
        });

        it('mark the row of a person picked on the map, keeping the overlap chosen when it holds them', async () => {
            const { pick } = renderDetail();
            await userEvent.click(
                screen.getByRole('button', {
                    name: 'Marketing, 2 people, 0 active',
                }),
            );
            pick({ userUuid: 'bob', request: 1 });
            expect(peopleShown()).toEqual([
                'ann@example.com',
                'bob@example.com',
            ]);
            expect(
                screen.getByText('bob@example.com').closest('tr'),
            ).toHaveAttribute('aria-current', 'true');
        });

        it('show a person picked on the map once: lists shown afresh for an overlap, or with its chip cleared, leave focus where it was', async () => {
            const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');
            try {
                const { pick } = renderDetail();
                pick({ userUuid: 'ann', request: 1 });
                const annRow = () =>
                    screen.getByText('ann@example.com').closest('tr');
                expect(scrolled).toHaveBeenCalledOnce();
                expect(annRow()).toHaveFocus();
                // Choosing an overlap that holds her lists its people afresh, and focus stays on the overlap chosen
                const marketing = screen.getByRole('button', {
                    name: 'Marketing, 2 people, 0 active',
                });
                await userEvent.click(marketing);
                expect(marketing).toHaveFocus();
                expect(annRow()).toHaveAttribute('aria-current', 'true');
                await userEvent.click(
                    screen.getByRole('button', {
                        name: 'Sales, 1 person, 0 active',
                    }),
                );
                expect(peopleShown()).toEqual(['bob@example.com']);
                // Clearing the chip moves focus to the Overlaps heading, not back to her
                screen
                    .getByRole('button', {
                        name: 'Clear filter: Also in Sales',
                    })
                    .focus();
                await userEvent.keyboard('{Enter}');
                expect(
                    screen.getByRole('heading', { name: 'Overlaps' }),
                ).toHaveFocus();
                expect(annRow()).toHaveAttribute('aria-current', 'true');
                expect(scrolled).toHaveBeenCalledOnce();
                // Picking her again brings her row back
                pick({ userUuid: 'ann', request: 2 });
                expect(scrolled).toHaveBeenCalledTimes(2);
                expect(annRow()).toHaveFocus();
            } finally {
                scrolled.mockRestore();
            }
        });

        it('bring everyone back for a person picked on the map whom the overlap chosen leaves out', async () => {
            const { pick } = renderDetail();
            await userEvent.click(
                screen.getByRole('button', {
                    name: 'Sales, 1 person, 0 active',
                }),
            );
            expect(peopleShown()).toEqual(['bob@example.com']);
            pick({ userUuid: 'cat', request: 1 });
            expect(
                screen.queryByRole('button', { name: /^Clear filter/ }),
            ).not.toBeInTheDocument();
            expect(peopleShown()).toEqual([
                'ann@example.com',
                'bob@example.com',
                'cat@example.com',
            ]);
            const row = screen.getByText('cat@example.com').closest('tr');
            expect(row).toHaveAttribute('aria-current', 'true');
            expect(row).toHaveFocus();
        });
    });
});
