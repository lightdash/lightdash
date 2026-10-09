import { type OrganizationAdoptionSummary } from '@lightdash/common';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    placed: placedMetricsFixture(memberCount, activeCount30d),
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
                name: '2 people are in more than one department',
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
});
