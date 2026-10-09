import { type OrganizationAdoptionSummary } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('Adoption', () => {
    beforeEach(() => {
        summary.mockReset();
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
});
