import { type OrganizationAdoptionSummary } from '@lightdash/common';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type FC } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import {
    dept,
    metricsFixture,
    placedMetricsFixture,
} from '../features/adoption/utils/adoptionFixtures';
import Adoption from './Adoption';

const summary = vi.fn();
vi.mock('../hooks/useOrgDepartments', () => ({
    useOrgAdoptionSummary: () => summary(),
    useDepartmentMembership: () => ({ data: [], isInitialLoading: false }),
    useSetDepartmentMembers: () => ({ mutate: vi.fn(), isLoading: false }),
    useSetPrimaryDepartment: () => ({ mutate: vi.fn(), isLoading: false }),
}));
// The map draws with real layout, which jsdom does not have; this one shows what the page gives it
const { mapSelection } = vi.hoisted(() => ({ mapSelection: vi.fn() }));
vi.mock('../features/adoption/map/AdoptionMap', () => ({
    AdoptionMap: ({
        selectedUuid,
        onSelect,
    }: {
        selectedUuid: string | null;
        onSelect: (departmentUuid: string | null) => void;
    }) => {
        mapSelection(selectedUuid);
        return (
            <>
                <button type="button" onClick={() => onSelect('Operations')}>
                    Select Operations on the map
                </button>
                <button type="button" onClick={() => onSelect(null)}>
                    Select the organization on the map
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
    departments: [dept('Operations', null, 10)],
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
                '/generalSettings/adoption?view=map&department=Operations',
            );
            expect(mapSelection).toHaveBeenLastCalledWith('Operations');
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
                '/generalSettings/adoption?view=map&department=Operations',
            );
            expect(mapSelection).toHaveBeenLastCalledWith('Operations');
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
                '/generalSettings/adoption?view=map&department=Operations',
            );
            await userEvent.click(
                screen.getByRole('radio', { name: 'Waffle' }),
            );
            expect(location()).toHaveTextContent(
                '/generalSettings/adoption?view=waffle&department=Operations',
            );
            expect(
                screen.getByRole('button', { name: /^Operations,/ }),
            ).toHaveAttribute('aria-current', 'true');
        });
    });
});
