import { type OrganizationAdoptionSummary } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    useDepartmentMembership: () => ({ data: [], isInitialLoading: false }),
    useSetDepartmentMembers: () => ({ mutate: vi.fn(), isLoading: false }),
    useSetPrimaryDepartment: () => ({ mutate: vi.fn(), isLoading: false }),
}));
// The map draws with real layout, which jsdom does not have
vi.mock('../features/adoption/map/AdoptionMap', () => ({
    AdoptionMap: () => null,
}));

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
    placed: { memberCount, activeCount30d },
    departments: [dept('Operations', null, 10)],
    attention,
});

const renderPage = (
    data: OrganizationAdoptionSummary,
    appMocks?: Parameters<typeof renderWithProviders>[1],
) => {
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
        appMocks,
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
                name: '2 people are in more than one department',
            }),
        );
        expect(
            await screen.findByRole('tab', { name: 'Shared', selected: true }),
        ).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Close' }));
        await userEvent.click(
            screen.getByRole('button', { name: 'Place people' }),
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
});
