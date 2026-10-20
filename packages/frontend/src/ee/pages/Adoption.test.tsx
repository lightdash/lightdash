import {
    type DepartmentDetail,
    type DepartmentOverlaps,
    type DepartmentWithMetrics,
    type OrganizationAdoptionSummary,
} from '@lightdash/common';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type FC } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { EventName } from '../../types/Events';
import {
    dept,
    memberFixture,
    metricsFixture,
    placedMetricsFixture,
    withServerHeadcounts,
} from '../features/adoption/utils/adoptionFixtures';
import Adoption, { AdoptionDepartmentRedirect } from './Adoption';

const OPERATIONS = '11111111-2222-4333-8444-555555555555';
const STORES = '22222222-2222-4333-8444-555555555555';
const UNKNOWN = '99999999-2222-4333-8444-555555555555';
const MARKETING = '33333333-2222-4333-8444-555555555555';

// Operations and Stores under it
const [operations, stores] = withServerHeadcounts([
    dept('Operations', null, 10, { departmentUuid: OPERATIONS }),
    dept('Stores', OPERATIONS, 10, { departmentUuid: STORES }),
]);

// Operations' people: Sue is also in Marketing, Sam is not
const OPERATIONS_PEOPLE = [
    memberFixture('sam', null, {
        departmentUuid: OPERATIONS,
        departmentName: 'Operations',
    }),
    memberFixture('sue', null, {
        departmentUuid: OPERATIONS,
        departmentName: 'Operations',
        sharedWith: [{ departmentUuid: MARKETING, name: 'Marketing' }],
    }),
];

// A department as the server sends it, with where it sits, what is below it and its people
const detailOf = (
    department: DepartmentWithMetrics,
    ancestors: DepartmentDetail['ancestors'],
    children: DepartmentWithMetrics[],
    members: DepartmentDetail['members'],
): DepartmentDetail => ({
    department,
    ancestors,
    children,
    targetProgress: null,
    weeklyActive: department.metrics.weeklyActive.map((point) => ({
        ...point,
        orgAverage: 0,
    })),
    topContent: { dashboards: [], explores: [], aiAgents: [] },
    members,
});

// Operations shares Sue with Marketing
const operationsOverlaps = (
    members: DepartmentOverlaps['members'],
): DepartmentOverlaps => ({
    department: { departmentUuid: OPERATIONS, name: 'Operations' },
    overlaps: [
        {
            departmentUuid: MARKETING,
            name: 'Marketing',
            people: 1,
            active30d: 0,
        },
    ],
    venn: null,
    members,
});

const summary = vi.fn();
const { track, remove, membershipEnabled, deleting, mutation } = vi.hoisted(
    () => ({
        track: vi.fn(),
        remove: vi.fn(),
        membershipEnabled: vi.fn(),
        // Departments whose delete is in flight: their refetch answers 404, and the last data stays
        deleting: new Set<string>(),
        mutation: () => ({ mutateAsync: vi.fn(), isLoading: false }),
    }),
);
vi.mock('../hooks/useOrgDepartments', () => ({
    useOrgAdoptionSummary: () => summary(),
    // Like the server: the two departments, and a 404 for any other uuid
    useDepartmentDetail: (departmentUuid: string | undefined) => {
        const answer = (data: DepartmentDetail) =>
            departmentUuid !== undefined && deleting.has(departmentUuid)
                ? {
                      isInitialLoading: false,
                      isError: true,
                      data,
                      error: {
                          error: { statusCode: 404, message: 'Not found' },
                      },
                  }
                : {
                      isInitialLoading: false,
                      isError: false,
                      data,
                      error: null,
                  };
        if (departmentUuid === OPERATIONS) {
            return answer(
                detailOf(operations, [], [stores], OPERATIONS_PEOPLE),
            );
        }
        if (departmentUuid === STORES) {
            return answer(
                detailOf(
                    stores,
                    [{ departmentUuid: OPERATIONS, name: 'Operations' }],
                    [],
                    [],
                ),
            );
        }
        return departmentUuid === undefined
            ? { isInitialLoading: false, isError: false, data: undefined }
            : {
                  isInitialLoading: false,
                  isError: true,
                  data: undefined,
                  error: { error: { statusCode: 404, message: 'Not found' } },
              };
    },
    // Operations' overlap with Marketing, and Sue when it is chosen
    useDepartmentOverlaps: (
        departmentUuid: string | undefined,
        withUuids: string[] = [],
    ) => ({
        isInitialLoading: false,
        isError: false,
        data:
            departmentUuid === OPERATIONS
                ? operationsOverlaps(
                      withUuids.includes(MARKETING)
                          ? [OPERATIONS_PEOPLE[1]]
                          : null,
                  )
                : undefined,
    }),
    // Like the real query: nothing until it is enabled
    useDepartmentMembership: (enabled: boolean) => {
        membershipEnabled(enabled);
        return { data: enabled ? [] : undefined, isInitialLoading: false };
    },
    useCreateDepartment: mutation,
    useUpdateDepartment: mutation,
    useDeleteDepartment: () => ({ mutateAsync: remove, isLoading: false }),
    useSetDepartmentOwners: mutation,
    useSetDepartmentGroups: mutation,
    useSetDepartmentMembers: () => ({
        mutate: vi.fn(),
        mutateAsync: vi.fn(),
        isLoading: false,
    }),
    useSetPrimaryDepartment: () => ({ mutate: vi.fn(), isLoading: false }),
}));
vi.mock('../../hooks/useOrganizationUsers', () => ({
    useOrganizationUsers: () => ({ data: [] }),
}));
vi.mock('../../hooks/useOrganizationGroups', () => ({
    useOrganizationGroups: () => ({ data: [] }),
}));
vi.mock('../../providers/Tracking/useTracking', () => ({
    default: () => ({ track }),
}));
// ECharts needs a real layout engine
vi.mock('../../components/EChartsReactWrapper', () => ({
    default: () => null,
}));
// The map draws with real layout, which jsdom does not have; this one shows what the page gives it
const { mapSelection, mapPerson } = vi.hoisted(() => ({
    mapSelection: vi.fn(),
    mapPerson: vi.fn(),
}));
vi.mock('../features/adoption/map/AdoptionMap', () => ({
    AdoptionMap: ({
        selectedUuid,
        onSelect,
        selectedUserUuid,
        onPersonClick,
    }: {
        selectedUuid: string | null;
        onSelect: (departmentUuid: string | null) => void;
        selectedUserUuid: string | null;
        onPersonClick: (userUuid: string) => void;
    }) => {
        mapSelection(selectedUuid);
        mapPerson(selectedUserUuid);
        return (
            <>
                <button type="button" onClick={() => onSelect(OPERATIONS)}>
                    Select Operations on the map
                </button>
                <button type="button" onClick={() => onSelect(null)}>
                    Select the organization on the map
                </button>
                <button type="button" onClick={() => onPersonClick('sue')}>
                    Pick Sue on the map
                </button>
            </>
        );
    },
}));

// Where the page has taken the browser, so a test can read the link it wrote
const Location: FC = () => {
    const { pathname, search } = useLocation();
    return <span data-testid="location">{`${pathname}${search}`}</span>;
};
const location = () => screen.getByTestId('location');

// Someone who can manage departments, so the page offers to place people
const MANAGER: Parameters<typeof renderWithProviders>[1] = {
    user: {
        abilityRules: [
            {
                action: 'manage',
                subject: 'OrganizationAdoption',
                conditions: {
                    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
                },
            },
        ],
    },
};

const organizationSummary = (
    memberCount: number,
    activeCount30d: number,
    attention: OrganizationAdoptionSummary['attention'] = {
        unassignedCount: 0,
        sharedCount: 0,
    },
): OrganizationAdoptionSummary => ({
    organization: metricsFixture(memberCount, null, { activeCount30d }),
    placed: placedMetricsFixture(memberCount, activeCount30d),
    departments: [operations, stores],
    attention,
});

const renderPage = (
    data: OrganizationAdoptionSummary,
    appMocks?: Parameters<typeof renderWithProviders>[1],
    path = '/generalSettings/adoption',
) => {
    summary.mockReturnValue({
        isInitialLoading: false,
        isError: false,
        data,
        error: null,
    });
    renderWithProviders(
        <MemoryRouter initialEntries={[path]}>
            <Adoption />
            <Location />
        </MemoryRouter>,
        appMocks,
    );
};

// The views remembered for anyone, whichever user loaded first
const storedViews = () =>
    Object.keys(window.localStorage)
        .filter((key) => key.startsWith('lightdash-adoption-view:'))
        .map((key) => window.localStorage.getItem(key));

describe('Adoption', () => {
    beforeEach(() => {
        summary.mockReset();
        mapSelection.mockReset();
        mapPerson.mockReset();
        track.mockReset();
        remove.mockReset();
        membershipEnabled.mockReset();
        deleting.clear();
    });
    afterEach(() => {
        window.localStorage.clear();
    });

    it('keeps the title and description and leaves the organization numbers to the map panel', () => {
        renderPage(organizationSummary(1951, 1181));
        expect(screen.getByRole('heading', { name: 'Adoption' })).toBeVisible();
        expect(
            screen.getByText(
                "See how each department is adopting Lightdash, including the ones that haven't started",
            ),
        ).toBeVisible();
        expect(screen.queryByText(/1,951|1,181/)).not.toBeInTheDocument();
        expect(screen.queryByText(/on Lightdash/)).not.toBeInTheDocument();
        // Placing people needs the manage scope
        expect(
            screen.queryByRole('button', { name: 'Place people' }),
        ).not.toBeInTheDocument();
    });

    it('opens placing on people in no department, or on people in more than one from the link', async () => {
        renderPage(
            organizationSummary(20, 10, {
                unassignedCount: 3,
                sharedCount: 2,
            }),
            MANAGER,
        );
        await userEvent.click(
            await screen.findByRole('button', {
                name: '2 people in more than one department count in each of them',
            }),
        );
        expect(
            await screen.findByRole('tab', { name: 'Shared', selected: true }),
        ).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Close' }));
        await userEvent.click(
            within(screen.getByRole('alert')).getByRole('button', {
                name: 'place them',
            }),
        );
        expect(
            await screen.findByRole('tab', {
                name: 'Unassigned',
                selected: true,
            }),
        ).toBeInTheDocument();
        // Changing tab inside the dialog sticks
        await userEvent.click(screen.getByRole('tab', { name: 'Shared' }));
        expect(
            screen.getByRole('tab', { name: 'Shared', selected: true }),
        ).toBeInTheDocument();
    });

    describe('Place people in the header', () => {
        // The strip's own button sits in the alert; the header's is the other one
        const headerButton = async () => {
            const strip = screen.queryByRole('alert');
            const [button] = (
                await screen.findAllByRole('button', { name: 'Place people' })
            ).filter((candidate) => !strip?.contains(candidate));
            return button;
        };

        it('still opens placing when nobody needs placing, on people in more than one department', async () => {
            renderPage(organizationSummary(20, 10), MANAGER);
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
            expect(screen.queryByRole('status')).not.toBeInTheDocument();
            await userEvent.click(
                await screen.findByRole('button', { name: 'Place people' }),
            );
            expect(
                await screen.findByRole('tab', {
                    name: 'Shared',
                    selected: true,
                }),
            ).toBeInTheDocument();
        });

        it('opens on people in no department while there are any', async () => {
            renderPage(
                organizationSummary(20, 10, {
                    unassignedCount: 3,
                    sharedCount: 0,
                }),
                MANAGER,
            );
            await screen.findByRole('alert');
            await userEvent.click(await headerButton());
            expect(
                await screen.findByRole('tab', {
                    name: 'Unassigned',
                    selected: true,
                }),
            ).toBeInTheDocument();
        });
    });

    it('offers the Waffle view beside the map and the list, and remembers the choice', async () => {
        renderPage(organizationSummary(12, 6));
        expect(
            screen
                .getAllByRole('radio')
                .map((radio) => radio.getAttribute('value')),
        ).toEqual(['map', 'list', 'waffle']);
        await userEvent.click(screen.getByRole('radio', { name: 'Waffle' }));
        expect(
            screen.getByRole('group', { name: 'Departments in the waffle' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /^Operations,/ }),
        ).toBeInTheDocument();
        expect(storedViews()).toContain('waffle');
    });

    it('opens on the waffle when it was the view last chosen', async () => {
        // Remembered per person; the page reads it before and after the person has loaded
        window.localStorage.setItem(
            'lightdash-adoption-view:anonymous',
            'waffle',
        );
        window.localStorage.setItem(
            'lightdash-adoption-view:b264d83a-9000-426a-85ec-3f9c20f368ce',
            'waffle',
        );
        renderPage(organizationSummary(12, 6));
        expect(
            await screen.findByRole('group', {
                name: 'Departments in the waffle',
            }),
        ).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: 'Waffle' })).toBeChecked();
    });

    describe('the department selected', () => {
        it('is the one the link names when the page opens', () => {
            renderPage(
                organizationSummary(12, 6),
                undefined,
                `/generalSettings/adoption?view=map&department=${OPERATIONS}`,
            );
            expect(mapSelection).toHaveBeenLastCalledWith(OPERATIONS);
        });

        it('is none without one in the link, or with an empty one', () => {
            renderPage(
                organizationSummary(12, 6),
                undefined,
                '/generalSettings/adoption?view=map&department=',
            );
            expect(mapSelection).toHaveBeenLastCalledWith(null);
        });

        it('goes into the link when chosen and comes out when the organization is chosen, keeping the view', async () => {
            renderPage(
                organizationSummary(12, 6),
                undefined,
                '/generalSettings/adoption?view=map',
            );
            await userEvent.click(
                screen.getByRole('button', {
                    name: 'Select Operations on the map',
                }),
            );
            expect(location()).toHaveTextContent(
                `/generalSettings/adoption?view=map&department=${OPERATIONS}`,
            );
            expect(mapSelection).toHaveBeenLastCalledWith(OPERATIONS);
            await userEvent.click(
                screen.getByRole('button', {
                    name: 'Select the organization on the map',
                }),
            );
            expect(location()).toHaveTextContent(
                /^\/generalSettings\/adoption\?view=map$/,
            );
            expect(mapSelection).toHaveBeenLastCalledWith(null);
        });

        it('stays selected when the view changes', async () => {
            renderPage(
                organizationSummary(12, 6),
                undefined,
                `/generalSettings/adoption?view=map&department=${OPERATIONS}`,
            );
            await userEvent.click(
                screen.getByRole('radio', { name: 'Waffle' }),
            );
            expect(location()).toHaveTextContent(
                `/generalSettings/adoption?view=waffle&department=${OPERATIONS}`,
            );
            expect(
                screen.getByRole('button', { name: /^Operations,/ }),
            ).toHaveAttribute('aria-current', 'true');
        });

        const view = (name: string) => screen.getByRole('region', { name });
        const stripHeight = (name: string) =>
            view(name).style.getPropertyValue('--adoption-view-height');
        const panel = () =>
            screen.queryByRole('complementary', { name: 'Details' });

        it('turns the view into a 280 px strip with the department below it in place of the panel', async () => {
            renderPage(
                organizationSummary(12, 6),
                MANAGER,
                `/generalSettings/adoption?view=waffle&department=${OPERATIONS}`,
            );
            expect(stripHeight('Waffle')).toBe('280px');
            expect(panel()).toBeNull();
            expect(
                screen.getByRole('heading', { name: 'Operations' }),
            ).toHaveFocus();
            // Place people sits beside the department's name, and the header keeps New department only
            expect(
                await screen.findAllByRole('button', { name: 'Place people' }),
            ).toHaveLength(1);
            expect(
                screen.getByRole('button', { name: 'Edit department' }),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'New department' }),
            ).toBeInTheDocument();
        });

        it('shows the view at full height with the panel beside it while nothing is selected', async () => {
            renderPage(
                organizationSummary(12, 6),
                MANAGER,
                '/generalSettings/adoption?view=waffle',
            );
            expect(stripHeight('Waffle')).toBe('');
            expect(panel()).toBeInTheDocument();
            expect(
                screen.queryByRole('navigation', {
                    name: 'Selected department',
                }),
            ).toBeNull();
            expect(
                await screen.findAllByRole('button', { name: 'Place people' }),
            ).toHaveLength(1);
        });

        it('deselects on Escape, restoring the full view and the panel, and moves focus back to the view', async () => {
            renderPage(
                organizationSummary(12, 6),
                undefined,
                `/generalSettings/adoption?view=waffle&department=${OPERATIONS}`,
            );
            expect(
                screen.getByRole('heading', { name: 'Operations' }),
            ).toHaveFocus();
            await userEvent.keyboard('{Escape}');
            expect(location()).toHaveTextContent(
                /^\/generalSettings\/adoption\?view=waffle$/,
            );
            expect(stripHeight('Waffle')).toBe('');
            expect(panel()).toBeInTheDocument();
            expect(view('Waffle')).toHaveFocus();
        });

        it('selects the parent from the breadcrumb, and the organization from its first link', async () => {
            renderPage(
                organizationSummary(12, 6),
                undefined,
                `/generalSettings/adoption?view=list&department=${STORES}`,
            );
            const crumbs = () =>
                screen.getByRole('navigation', {
                    name: 'Selected department',
                });
            await userEvent.click(
                within(crumbs()).getByRole('link', { name: 'Operations' }),
            );
            expect(location()).toHaveTextContent(
                `/generalSettings/adoption?view=list&department=${OPERATIONS}`,
            );
            expect(
                screen.getByRole('heading', { name: 'Operations' }),
            ).toHaveFocus();
            await userEvent.click(
                within(crumbs()).getByRole('link', { name: 'Organization' }),
            );
            expect(location()).toHaveTextContent(
                /^\/generalSettings\/adoption\?view=list$/,
            );
            expect(view('List')).toHaveFocus();
        });

        it('opens the department from a block of the waffle', async () => {
            renderPage(
                organizationSummary(12, 6),
                undefined,
                '/generalSettings/adoption?view=waffle',
            );
            await userEvent.click(
                screen.getByRole('button', { name: /^Operations,/ }),
            );
            expect(location()).toHaveTextContent(
                `/generalSettings/adoption?view=waffle&department=${OPERATIONS}`,
            );
            expect(
                screen.getByRole('heading', { name: 'Operations' }),
            ).toHaveFocus();
        });

        it('opens the department from a row of the list, which it marks', async () => {
            renderPage(
                organizationSummary(12, 6),
                undefined,
                '/generalSettings/adoption?view=list',
            );
            await userEvent.click(
                screen.getByRole('link', { name: 'Operations' }),
            );
            expect(location()).toHaveTextContent(
                `/generalSettings/adoption?view=list&department=${OPERATIONS}`,
            );
            expect(stripHeight('List')).toBe('280px');
            expect(
                screen.getByRole('heading', { name: 'Operations' }),
            ).toHaveFocus();
            expect(
                screen.getByRole('link', { name: 'Operations' }).closest('tr'),
            ).toHaveAttribute('aria-current', 'true');
        });

        it("keeps the strip and shows the department's error in place when it cannot be found", () => {
            renderPage(
                organizationSummary(12, 6),
                undefined,
                `/generalSettings/adoption?view=waffle&department=${UNKNOWN}`,
            );
            expect(stripHeight('Waffle')).toBe('280px');
            expect(screen.getByText('Department not found')).toBeVisible();
            // The view still offers every department
            expect(
                screen.getByRole('button', { name: /^Operations,/ }),
            ).toBeInTheDocument();
        });

        it('scrolls to and marks the row of a person picked on the map, whom the map marks too', async () => {
            const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');
            try {
                renderPage(
                    organizationSummary(12, 6),
                    undefined,
                    `/generalSettings/adoption?view=map&department=${OPERATIONS}`,
                );
                await userEvent.click(
                    screen.getByRole('button', { name: 'Pick Sue on the map' }),
                );
                const row = screen.getByText('sue@example.com').closest('tr');
                expect(row).toHaveAttribute('aria-current', 'true');
                expect(row).toHaveFocus();
                expect(scrolled.mock.contexts).toContain(row);
                expect(mapPerson).toHaveBeenLastCalledWith('sue');
                // Another selection drops the person
                await userEvent.click(
                    screen.getByRole('button', { name: /^Stores/ }),
                );
                expect(mapPerson).toHaveBeenLastCalledWith(null);
            } finally {
                scrolled.mockRestore();
            }
        });

        it('starts a department returned to with everyone, whatever overlap was chosen before', async () => {
            renderPage(
                organizationSummary(12, 6),
                undefined,
                `/generalSettings/adoption?view=list&department=${OPERATIONS}`,
            );
            await userEvent.click(
                screen.getByRole('button', {
                    name: 'Marketing, 1 person, 0 active',
                }),
            );
            expect(
                screen.getByRole('button', {
                    name: 'Clear filter: Also in Marketing',
                }),
            ).toBeInTheDocument();
            expect(screen.queryByText('sam@example.com')).toBeNull();
            await userEvent.click(
                screen.getByRole('button', { name: /^Stores/ }),
            );
            await userEvent.click(
                within(
                    screen.getByRole('navigation', {
                        name: 'Selected department',
                    }),
                ).getByRole('link', { name: 'Operations' }),
            );
            expect(
                screen.queryByRole('button', { name: /^Clear filter/ }),
            ).toBeNull();
            expect(screen.getByText('sam@example.com')).toBeInTheDocument();
        });

        it('writes the view it was selected in beside the department, and keeps the view when deselected', async () => {
            // Nothing in the link names a view; the waffle is the one this person last chose
            window.localStorage.setItem(
                'lightdash-adoption-view:b264d83a-9000-426a-85ec-3f9c20f368ce',
                'waffle',
            );
            window.localStorage.setItem(
                'lightdash-adoption-view:anonymous',
                'waffle',
            );
            renderPage(
                organizationSummary(12, 6),
                undefined,
                '/generalSettings/adoption',
            );
            await userEvent.click(
                await screen.findByRole('button', { name: /^Operations,/ }),
            );
            expect(location()).toHaveTextContent(
                `/generalSettings/adoption?department=${OPERATIONS}&view=waffle`,
            );
            await userEvent.keyboard('{Escape}');
            expect(location()).toHaveTextContent(
                /^\/generalSettings\/adoption\?view=waffle$/,
            );
        });

        it('gives a link that names a department but no view the view it opens in', () => {
            renderPage(
                organizationSummary(12, 6),
                undefined,
                `/generalSettings/adoption?department=${OPERATIONS}`,
            );
            expect(location()).toHaveTextContent(
                `/generalSettings/adoption?department=${OPERATIONS}&view=map`,
            );
        });

        it('sends one event for each department selected, with the view it was selected in', async () => {
            renderPage(
                organizationSummary(12, 6),
                undefined,
                '/generalSettings/adoption?view=waffle',
            );
            expect(track).not.toHaveBeenCalled();
            await userEvent.click(
                screen.getByRole('button', { name: /^Operations,/ }),
            );
            expect(track).toHaveBeenCalledExactlyOnceWith({
                name: EventName.ADOPTION_DEPARTMENT_SELECTED,
                properties: { departmentUuid: OPERATIONS, view: 'waffle' },
            });
            // Another view of the same department sends nothing; another department sends one more
            await userEvent.click(screen.getByRole('radio', { name: 'List' }));
            expect(track).toHaveBeenCalledOnce();
            await userEvent.click(
                screen.getByRole('button', { name: /^Stores/ }),
            );
            expect(track).toHaveBeenCalledTimes(2);
            expect(track).toHaveBeenLastCalledWith({
                name: EventName.ADOPTION_DEPARTMENT_SELECTED,
                properties: { departmentUuid: STORES, view: 'list' },
            });
            // Deselecting sends nothing, and selecting it again sends one more
            await userEvent.keyboard('{Escape}');
            expect(track).toHaveBeenCalledTimes(2);
            await userEvent.click(
                screen.getByRole('link', { name: 'Operations' }),
            );
            expect(track).toHaveBeenCalledTimes(3);
        });

        it('sends the event once for a department the page opens on', () => {
            renderPage(
                organizationSummary(12, 6),
                undefined,
                `/generalSettings/adoption?view=map&department=${OPERATIONS}`,
            );
            expect(track).toHaveBeenCalledExactlyOnceWith({
                name: EventName.ADOPTION_DEPARTMENT_SELECTED,
                properties: { departmentUuid: OPERATIONS, view: 'map' },
            });
        });

        it("hands the department's people to Edit department, so the drawer lists them without loading everyone", async () => {
            renderPage(
                organizationSummary(12, 6),
                MANAGER,
                `/generalSettings/adoption?view=waffle&department=${OPERATIONS}`,
            );
            await userEvent.click(
                await screen.findByRole('button', { name: 'Edit department' }),
            );
            const drawer = await screen.findByRole('dialog', {
                name: 'Edit Operations',
            });
            expect(
                within(drawer).getByText('2 people in this department'),
            ).toBeInTheDocument();
            expect(within(drawer).getByText('sam L')).toBeInTheDocument();
            expect(within(drawer).getByText('sue L')).toBeInTheDocument();
            expect(membershipEnabled).toHaveBeenCalled();
            expect(membershipEnabled).not.toHaveBeenCalledWith(true);
        });

        it('loads everyone for a department edited from the list with none selected', async () => {
            renderPage(
                organizationSummary(12, 6),
                MANAGER,
                '/generalSettings/adoption?view=list',
            );
            await userEvent.click(
                await screen.findByRole('button', { name: 'Edit Operations' }),
            );
            await screen.findByRole('dialog', { name: 'Edit Operations' });
            expect(membershipEnabled).toHaveBeenCalledWith(true);
        });

        it('keeps the department shown while its delete is in flight, and deselects it once deleted', async () => {
            let finishDelete = (_: null) => {};
            remove.mockImplementation(
                () =>
                    new Promise<null>((resolve) => {
                        finishDelete = resolve;
                    }),
            );
            renderPage(
                organizationSummary(12, 6),
                MANAGER,
                `/generalSettings/adoption?view=waffle&department=${OPERATIONS}`,
            );
            await userEvent.click(
                await screen.findByRole('button', { name: 'Edit department' }),
            );
            const drawer = await screen.findByRole('dialog', {
                name: 'Edit Operations',
            });
            await userEvent.click(
                within(drawer).getByRole('button', {
                    name: 'Delete department',
                }),
            );
            // While the delete is in flight the department answers 404, which the page does not show
            deleting.add(OPERATIONS);
            await userEvent.click(
                within(
                    await screen.findByRole('dialog', {
                        name: 'Delete Operations',
                    }),
                ).getByRole('button', { name: 'Delete department' }),
            );
            expect(remove).toHaveBeenCalledWith(OPERATIONS);
            expect(
                screen.getByRole('heading', { name: 'Operations' }),
            ).toBeInTheDocument();
            expect(screen.queryByText('Department not found')).toBeNull();
            await act(async () => finishDelete(null));
            expect(location()).toHaveTextContent(
                /^\/generalSettings\/adoption\?view=waffle$/,
            );
            expect(
                screen.queryByRole('navigation', {
                    name: 'Selected department',
                }),
            ).toBeNull();
        });
    });

    it("redirects the department page's old link to the department selected on this page", () => {
        summary.mockReturnValue({
            isInitialLoading: false,
            isError: false,
            data: organizationSummary(12, 6),
            error: null,
        });
        renderWithProviders(
            <MemoryRouter
                initialEntries={[`/generalSettings/adoption/${OPERATIONS}`]}
            >
                <Routes>
                    <Route
                        path="/generalSettings/adoption"
                        element={<Adoption />}
                    />
                    <Route
                        path="/generalSettings/adoption/:departmentUuid"
                        element={<AdoptionDepartmentRedirect />}
                    />
                </Routes>
                <Location />
            </MemoryRouter>,
        );
        // The view it opens in is added to the link
        expect(location()).toHaveTextContent(
            `/generalSettings/adoption?department=${OPERATIONS}&view=map`,
        );
        expect(
            screen.getByRole('heading', { name: 'Operations' }),
        ).toBeInTheDocument();
    });
});
