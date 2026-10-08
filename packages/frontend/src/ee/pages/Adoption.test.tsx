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

    it('groups thousands in the organization numbers under the title', () => {
        renderPage(organizationSummary(1951, 1181));
        expect(
            screen.getByText(
                '1,951 people on Lightdash · 1,181 active in the last 30 days',
            ),
        ).toBeVisible();
    });

    it('counts one person in the singular', () => {
        renderPage(organizationSummary(1, 1));
        expect(
            screen.getByText(
                '1 person on Lightdash · 1 active in the last 30 days',
            ),
        ).toBeVisible();
    });
});
