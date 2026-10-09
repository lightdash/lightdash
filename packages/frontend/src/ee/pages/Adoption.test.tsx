import { type OrganizationAdoptionSummary } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import {
    dept,
    metricsFixture,
} from '../features/adoption/utils/adoptionFixtures';
import Adoption from './Adoption';

const summary = vi.fn();
vi.mock('../hooks/useOrgDepartments', () => ({
    useOrgAdoptionSummary: () => summary(),
}));
// The map draws with real layout, which jsdom does not have
vi.mock('../features/adoption/map/AdoptionMap', () => ({
    AdoptionMap: () => null,
}));

const organizationSummary = (
    memberCount: number,
    activeCount30d: number,
): OrganizationAdoptionSummary => ({
    organization: metricsFixture(memberCount, null, { activeCount30d }),
    departments: [dept('Operations', null, 10)],
    attention: { conflictCount: 0, unassignedCount: 0 },
});

const renderPage = (data: OrganizationAdoptionSummary) => {
    summary.mockReturnValue({
        isInitialLoading: false,
        isError: false,
        data,
        error: null,
    });
    renderWithProviders(
        <MemoryRouter initialEntries={['/generalSettings/adoption']}>
            <Adoption />
        </MemoryRouter>,
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
});
