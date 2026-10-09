import {
    type DepartmentDetail,
    type DepartmentMember,
    type DepartmentOverlaps,
    type OrganizationAdoptionSummary,
} from '@lightdash/common';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import {
    dept,
    memberFixture,
    metricsFixture,
} from '../features/adoption/utils/adoptionFixtures';
import { type WeeklyComparisonPoint } from '../features/adoption/utils/departmentDetail';
import AdoptionDepartment from './AdoptionDepartment';

const DEPARTMENT = '11111111-2222-4333-8444-555555555555';
const MARKETING = '22222222-2222-4333-8444-555555555555';
const SALES = '33333333-2222-4333-8444-555555555555';
const CHILD = '44444444-2222-4333-8444-555555555555';

const detail = vi.fn();
const summary = vi.fn();
const overlaps = vi.fn();
const chartWeeks = vi.fn();
vi.mock('../hooks/useOrgDepartments', () => ({
    useDepartmentDetail: (departmentUuid: string | undefined) =>
        detail(departmentUuid),
    useOrgAdoptionSummary: (enabled: boolean) => summary(enabled),
    useDepartmentOverlaps: (
        departmentUuid: string | undefined,
        withUuids: string[] = [],
        withoutUuids: string[] = [],
    ) => overlaps(departmentUuid, withUuids, withoutUuids),
}));
vi.mock('../features/adoption/components/WeeklyActiveChart', () => ({
    WeeklyActiveChart: ({ weeks }: { weeks: WeeklyComparisonPoint[] }) => {
        chartWeeks(weeks);
        return <div data-testid="weekly-chart" />;
    },
}));
const WEEK_STARTS = ['2026-09-21', '2026-09-28', '2026-10-05'];
const LONG_NOTE =
    'Headcount from the HR export of September 2026, contractors and interns excluded, reviewed by the people team';

// Data's headcount of 110 counts its 191 people on Lightdash, as no headcount is below them
const departmentDetail = (): DepartmentDetail => {
    const metrics = metricsFixture(191, 100, {
        activeCount30d: 85,
        activePct: 45,
        roleSplit: {
            viewers: 129,
            interactiveViewers: 40,
            editors: 20,
            admins: 2,
        },
        weeklyActive: WEEK_STARTS.map((weekStart, i) => ({
            weekStart,
            activeUsers: [50, 60, 40][i],
        })),
    });
    return {
        department: dept('Data', null, null, {
            departmentUuid: DEPARTMENT,
            headcount: 110,
            effectiveHeadcount: 191,
            headcountNote: LONG_NOTE,
            metrics,
            directMetrics: metrics,
        }),
        ancestors: [],
        children: [
            dept('Science', DEPARTMENT, null, {
                headcount: 8,
                effectiveHeadcount: 9,
                metrics: metricsFixture(9, 100, {
                    activeCount30d: 9,
                    activePct: 100,
                }),
            }),
            dept('Engineering', DEPARTMENT, null, {
                headcount: 34,
                effectiveHeadcount: 34,
                metrics: metricsFixture(33, 97),
            }),
        ],
        targetProgress: null,
        weeklyActive: metrics.weeklyActive.map((point) => ({
            ...point,
            orgAverage: 12,
        })),
        topContent: { dashboards: [], explores: [], aiAgents: [] },
        members: [],
    };
};

const organizationSummary = (): OrganizationAdoptionSummary => ({
    organization: metricsFixture(2000, null, {
        weeklyActive: WEEK_STARTS.map((weekStart, i) => ({
            weekStart,
            activeUsers: [1000, 500, 250][i],
        })),
    }),
    placed: { memberCount: 2000, activeCount30d: 0 },
    departments: [],
    attention: { unassignedCount: 0, sharedCount: 0 },
});

// A query that has answered, whether with a department or with its overlaps
const loaded = <T extends DepartmentDetail | DepartmentOverlaps>(data: T) => ({
    isInitialLoading: false,
    isError: false,
    data,
    error: null,
});

const ORGANIZATION = '172a2270-000f-42be-9c68-c4752c23ae51';
// Someone who can manage departments, so the page offers Edit department
const MANAGER: Parameters<typeof renderWithProviders>[1] = {
    user: {
        abilityRules: [
            {
                action: 'manage',
                subject: 'OrganizationAdoption',
                conditions: { organizationUuid: ORGANIZATION },
            },
        ],
    },
};

const renderPage = (
    segment: string = DEPARTMENT,
    appMocks?: Parameters<typeof renderWithProviders>[1],
) =>
    renderWithProviders(
        <MemoryRouter initialEntries={[`/generalSettings/adoption/${segment}`]}>
            <Routes>
                <Route
                    path="/generalSettings/adoption/:departmentUuid"
                    element={<AdoptionDepartment />}
                />
            </Routes>
        </MemoryRouter>,
        appMocks,
    );

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
        departmentUuid: DEPARTMENT,
        departmentName: 'Data',
        sharedWith: [{ departmentUuid: MARKETING, name: 'Marketing' }],
    }),
    memberFixture('bob', null, {
        departmentUuid: DEPARTMENT,
        departmentName: 'Data',
        sharedWith: [
            { departmentUuid: MARKETING, name: 'Marketing' },
            { departmentUuid: SALES, name: 'Sales' },
        ],
    }),
    memberFixture('cat', null, {
        departmentUuid: DEPARTMENT,
        departmentName: 'Data',
    }),
];
const MEMBERS_IN: Record<string, string[]> = {
    [MARKETING]: ['ann', 'bob'],
    [SALES]: ['bob'],
};

const departmentOverlaps = (): DepartmentOverlaps => ({
    department: { departmentUuid: DEPARTMENT, name: 'Data' },
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
            { departmentUuid: DEPARTMENT, name: 'Data' },
            { departmentUuid: MARKETING, name: 'Marketing' },
            { departmentUuid: SALES, name: 'Sales' },
        ],
        regions: [
            { sets: [DEPARTMENT], people: 1, active30d: 0 },
            { sets: [MARKETING], people: 40, active30d: 0 },
            { sets: [SALES], people: 30, active30d: 0 },
            { sets: [DEPARTMENT, MARKETING], people: 1, active30d: 0 },
            { sets: [DEPARTMENT, SALES], people: 0, active30d: 0 },
            { sets: [MARKETING, SALES], people: 2, active30d: 0 },
            { sets: [DEPARTMENT, MARKETING, SALES], people: 1, active30d: 0 },
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

describe('AdoptionDepartment', () => {
    beforeEach(() => {
        detail.mockReset();
        summary.mockReset();
        summary.mockReturnValue({ data: undefined });
        overlaps.mockReset();
        overlaps.mockReturnValue(idle);
    });

    it('says the department was not found on a 404, with a way back', () => {
        detail.mockReturnValue(failure(404));
        renderPage();
        expect(screen.getByText('Department not found')).toBeVisible();
        expect(
            screen.getByRole('link', { name: 'Back to adoption' }),
        ).toHaveAttribute('href', '/generalSettings/adoption');
    });
    it('says there is no access on a 403, with a way back', () => {
        detail.mockReturnValue(failure(403));
        renderPage();
        expect(
            screen.getByText("You don't have access to this department"),
        ).toBeVisible();
        expect(
            screen.getByRole('link', { name: 'Back to adoption' }),
        ).toBeVisible();
    });
    it('asks for the department named by a real uuid', () => {
        detail.mockReturnValue(failure(404));
        renderPage();
        expect(detail).toHaveBeenCalledWith(DEPARTMENT);
    });
    it.each([
        ['a word', 'ops'],
        ['an encoded path that climbs out', '..%2F..%2Fuser'],
        ['an encoded query string', 'x%3Fa%3D1'],
        ['the membership route', 'membership'],
        ['a uuid with something after it', `${DEPARTMENT}x`],
    ])('shows not found for %s and requests nothing', (_label, segment) => {
        detail.mockReturnValue({
            isInitialLoading: false,
            isError: false,
            data: undefined,
            error: null,
        });
        renderPage(segment);
        expect(screen.getByText('Department not found')).toBeVisible();
        expect(
            screen.getByRole('link', { name: 'Back to adoption' }),
        ).toBeVisible();
        // The hooks are told there is no department, so neither fetches
        detail.mock.calls.forEach(([departmentUuid]) =>
            expect(departmentUuid).toBeUndefined(),
        );
        summary.mock.calls.forEach(([enabled]) => expect(enabled).toBe(false));
    });

    describe('with a department loaded', () => {
        beforeEach(() => {
            chartWeeks.mockReset();
            detail.mockReturnValue(loaded(departmentDetail()));
        });

        it('asks for the organization numbers whoever is viewing', () => {
            renderPage();
            expect(summary).toHaveBeenCalledWith(true);
        });
        it("compares each week with the organization's rate applied to this department", () => {
            summary.mockReturnValue({ data: organizationSummary() });
            renderPage();
            // 1,000, 500 and 250 of 2,000 active, applied to 191 on Lightdash
            expect(chartWeeks).toHaveBeenLastCalledWith([
                { weekStart: '2026-09-21', activeUsers: 50, atOrgRate: 95.5 },
                { weekStart: '2026-09-28', activeUsers: 60, atOrgRate: 47.8 },
                { weekStart: '2026-10-05', activeUsers: 40, atOrgRate: 23.9 },
            ]);
        });
        it('draws no comparison for a department with nobody on Lightdash, and says why', () => {
            summary.mockReturnValue({ data: organizationSummary() });
            const empty = departmentDetail();
            const nobody = metricsFixture(0, 0, {
                weeklyActive: empty.department.metrics.weeklyActive.map(
                    ({ weekStart }) => ({ weekStart, activeUsers: 0 }),
                ),
            });
            detail.mockReturnValue(
                loaded({
                    ...empty,
                    department: { ...empty.department, metrics: nobody },
                    weeklyActive: nobody.weeklyActive.map((point) => ({
                        ...point,
                        orgAverage: 12,
                    })),
                }),
            );
            renderPage();
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
        it('compares a department with people on Lightdash without that note', () => {
            summary.mockReturnValue({ data: organizationSummary() });
            renderPage();
            expect(
                screen.queryByText('No comparison: nobody on Lightdash yet'),
            ).not.toBeInTheDocument();
        });
        it('draws the department alone until the organization numbers arrive', () => {
            renderPage();
            expect(chartWeeks).toHaveBeenLastCalledWith(
                WEEK_STARTS.map((weekStart, i) => ({
                    weekStart,
                    activeUsers: [50, 60, 40][i],
                    atOrgRate: null,
                })),
            );
        });
        it('shows coverage of a headcount that never counts fewer than the people on Lightdash', () => {
            renderPage();
            const tile = screen.getByRole('group', { name: 'Coverage' });
            expect(within(tile).getByText('100% (191)')).toBeVisible();
            expect(
                within(tile).getByText('191 of 191 people have an account'),
            ).toBeVisible();
            expect(
                screen.queryByText(/More accounts than headcount/),
            ).not.toBeInTheDocument();
        });
        it('shows the sub-departments as plain shares, none above 100%', () => {
            renderPage();
            const science = screen.getByRole('row', { name: /Science/ });
            const [coverage, active] = within(science)
                .getAllByRole('cell')
                .slice(1);
            [coverage, active].forEach((cell) => {
                expect(cell).toHaveTextContent(/^100% \(9\)$/);
            });
            const engineering = screen.getByRole('row', {
                name: /Engineering/,
            });
            expect(within(engineering).getByText('97% (33)')).toBeVisible();
        });
        it('shows activity as a share of the headcount, once when everyone in it has an account', () => {
            renderPage();
            const tile = screen.getByRole('group', {
                name: 'Active in 30 days',
            });
            expect(within(tile).getByText('45% (85)')).toBeVisible();
            expect(
                within(tile).getByText('85 of 191 people were active'),
            ).toBeVisible();
        });
        it('says there is no headcount in place of coverage where none is entered on the department or below it', () => {
            const none = departmentDetail();
            detail.mockReturnValue(
                loaded({
                    ...none,
                    department: {
                        ...none.department,
                        headcount: null,
                        hasHeadcount: false,
                    },
                    children: none.children.map((child) =>
                        child.name === 'Science'
                            ? { ...child, headcount: null, hasHeadcount: false }
                            : child,
                    ),
                }),
            );
            renderPage();
            const tile = screen.getByRole('group', { name: 'Coverage' });
            expect(within(tile).getByText('No headcount')).toBeVisible();
            expect(within(tile).queryByText(/100%/)).toBeNull();
            expect(
                within(tile).getByText('191 people on Lightdash'),
            ).toBeVisible();
            expect(
                within(
                    screen.getByRole('group', { name: 'Active in 30 days' }),
                ).getByText('85 of the 191 with an account were active'),
            ).toBeVisible();
            // A sub-department without one reads the same in its row; its activity still shows
            const [coverage, active] = within(
                screen.getByRole('row', { name: /Science/ }),
            )
                .getAllByRole('cell')
                .slice(1);
            expect(coverage).toHaveTextContent(/^No headcount$/);
            expect(active).toHaveTextContent(/^100% \(9\)$/);
        });
        it('asks people who can edit departments to add a headcount where none is entered', async () => {
            const none = departmentDetail();
            detail.mockReturnValue(
                loaded({
                    ...none,
                    department: {
                        ...none.department,
                        headcount: null,
                        hasHeadcount: false,
                    },
                }),
            );
            renderPage(DEPARTMENT, MANAGER);
            await screen.findByRole('button', { name: 'Edit department' });
            expect(
                within(
                    screen.getByRole('group', { name: 'Coverage' }),
                ).getByText('Add headcount'),
            ).toBeVisible();
        });
        it('keeps the breadcrumb, the title and Edit department, with no line of owners, headcount, groups or roles under them', async () => {
            renderPage(DEPARTMENT, MANAGER);
            expect(
                await screen.findByRole('button', { name: 'Edit department' }),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('link', { name: 'Adoption' }),
            ).toHaveAttribute('href', '/generalSettings/adoption');
            expect(screen.getByRole('heading', { name: 'Data' })).toBeVisible();
            ['Owners', 'Headcount', 'Linked groups', 'Roles'].forEach((label) =>
                expect(screen.queryByText(label)).not.toBeInTheDocument(),
            );
            expect(screen.queryByText(LONG_NOTE)).not.toBeInTheDocument();
            expect(
                screen.queryByText(/without an account|viewers/),
            ).not.toBeInTheDocument();
        });
        it('shows coverage and activity, and no target even when one is set', () => {
            const aiming = departmentDetail();
            detail.mockReturnValue(
                loaded({
                    ...aiming,
                    department: {
                        ...aiming.department,
                        targetActiveUsers: 120,
                        targetDate: '2026-12-31',
                    },
                    targetProgress: {
                        targetActiveUsers: 120,
                        targetDate: '2026-12-31',
                        activeUsers: 85,
                        remaining: 35,
                        weeksLeft: 12,
                    },
                }),
            );
            renderPage();
            expect(
                screen.getByRole('group', { name: 'Coverage' }),
            ).toBeVisible();
            expect(
                screen.getByRole('group', { name: 'Active in 30 days' }),
            ).toBeVisible();
            expect(
                screen.queryByRole('group', { name: 'Target progress' }),
            ).not.toBeInTheDocument();
            expect(screen.queryByText(/target/i)).not.toBeInTheDocument();
        });
        it('lists the key content, each item linked to it', () => {
            const PROJECT = '3675b69e-8324-4110-bdca-059031aa8da3';
            const used = departmentDetail();
            detail.mockReturnValue(
                loaded({
                    ...used,
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
            renderPage();
            expect(
                screen.getByRole('heading', { name: 'Key content' }),
            ).toBeVisible();
            expect(
                screen.queryByText('What this department uses'),
            ).not.toBeInTheDocument();
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

    describe('overlaps', () => {
        beforeEach(() => {
            detail.mockReturnValue(
                loaded({ ...departmentDetail(), members: PEOPLE }),
            );
            overlaps.mockImplementation(answerOverlaps);
        });

        const sectionTitles = () =>
            screen
                .getAllByRole('heading')
                .map((heading) => heading.textContent)
                .filter((title) =>
                    [
                        'Key content',
                        'Overlaps',
                        'Sub-departments',
                        'People',
                    ].includes(title ?? ''),
                );

        it('shows the overlaps between the key content and the sub-departments', () => {
            renderPage();
            expect(sectionTitles()).toEqual([
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
        it('leaves the section out when no department outside this one shares its people', () => {
            overlaps.mockImplementation((departmentUuid: string | undefined) =>
                departmentUuid === undefined
                    ? idle
                    : loaded({
                          ...departmentOverlaps(),
                          overlaps: [],
                          venn: null,
                      }),
            );
            renderPage();
            expect(sectionTitles()).toEqual([
                'Key content',
                'Sub-departments',
                'People',
            ]);
        });
        it("asks for this department's overlaps, and for nobody's people until an overlap is chosen", () => {
            renderPage();
            expect(overlaps).toHaveBeenCalledWith(DEPARTMENT, [], []);
            expect(overlaps).toHaveBeenCalledWith(undefined, [], []);
            overlaps.mock.calls.forEach((call) =>
                expect([
                    [DEPARTMENT, [], []],
                    [undefined, [], []],
                ]).toContainEqual(call),
            );
            expect(peopleShown()).toEqual([
                'ann@example.com',
                'bob@example.com',
                'cat@example.com',
            ]);
        });
        it('says which other departments each person is also in', () => {
            renderPage();
            expect(screen.getByText('Also in Marketing')).toBeVisible();
            expect(
                screen.getByText('Also in Marketing and Sales'),
            ).toBeVisible();
        });
        it('choosing a department lists only the people also in it, and the chip brings everyone back', async () => {
            renderPage();
            await userEvent.click(
                screen.getByRole('button', {
                    name: 'Marketing, 2 people, 0 active',
                }),
            );
            expect(overlaps).toHaveBeenLastCalledWith(
                DEPARTMENT,
                [MARKETING],
                [],
            );
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
            expect(
                screen.queryByRole('button', {
                    name: 'Clear filter: Also in Marketing',
                }),
            ).not.toBeInTheDocument();
            expect(overlaps).toHaveBeenLastCalledWith(undefined, [], []);
        });
        it('choosing a region of the diagram lists exactly the people in it', async () => {
            renderPage();
            await userEvent.click(
                screen.getByRole('button', {
                    name: 'Data and Marketing, 1 person',
                }),
            );
            expect(overlaps).toHaveBeenLastCalledWith(
                DEPARTMENT,
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
                DEPARTMENT,
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
        it('starts the people of each overlap on their first page', async () => {
            const many = Array.from({ length: 60 }, (_, i) =>
                memberFixture(`m${String(i).padStart(2, '0')}`, null, {
                    departmentUuid: DEPARTMENT,
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
            renderPage();
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
        it('shows that the chosen people are loading, and offers a retry when they fail', async () => {
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
            renderPage();
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
        it('starts every department with everyone, including one returned to', async () => {
            const parent = departmentDetail();
            const science = {
                ...parent.children[0],
                departmentUuid: CHILD,
                name: 'Science',
            };
            detail.mockImplementation((departmentUuid: string | undefined) =>
                loaded(
                    departmentUuid === CHILD
                        ? {
                              ...parent,
                              department: science,
                              ancestors: [
                                  { departmentUuid: DEPARTMENT, name: 'Data' },
                              ],
                              children: [],
                              members: PEOPLE,
                          }
                        : { ...parent, members: PEOPLE, children: [science] },
                ),
            );
            renderPage();
            const chooseMarketing = () =>
                userEvent.click(
                    screen.getByRole('button', {
                        name: 'Marketing, 2 people, 0 active',
                    }),
                );
            const expectEveryone = () => {
                expect(overlaps).toHaveBeenLastCalledWith(undefined, [], []);
                expect(peopleShown()).toHaveLength(3);
                expect(
                    screen.queryByRole('button', { name: /^Clear filter/ }),
                ).not.toBeInTheDocument();
            };
            await chooseMarketing();
            expect(peopleShown()).toHaveLength(2);
            await userEvent.click(
                screen.getByRole('link', { name: 'Science' }),
            );
            expect(detail).toHaveBeenLastCalledWith(CHILD);
            expectEveryone();
            // Back on the first department, its earlier choice is gone too
            await userEvent.click(screen.getByRole('link', { name: 'Data' }));
            expect(detail).toHaveBeenLastCalledWith(DEPARTMENT);
            expectEveryone();
        });
        it('moves keyboard focus to the Overlaps heading when the chip is cleared', async () => {
            renderPage();
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
    });
});
