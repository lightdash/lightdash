import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import ForbiddenPanel from './ForbiddenPanel';

const state = vi.hoisted(() => ({
    needsProject: false,
    isInitialLoading: false,
    canAskForSampleData: false,
}));

vi.mock('../hooks/usePlaygroundAvailability', () => ({
    usePlaygroundAvailability: () => ({
        isConnectJourney: state.canAskForSampleData,
        isAvailable: state.canAskForSampleData,
    }),
}));

vi.mock('../hooks/organization/useOrganization', () => ({
    useOrganization: () => ({
        data: { needsProject: state.needsProject },
        isInitialLoading: state.isInitialLoading,
    }),
}));

vi.mock('../providers/Ability', () => ({
    Can: ({
        children,
    }: {
        children: (isAllowed: boolean) => React.ReactNode;
    }) => children(false),
}));

const renderForbiddenPanel = (subject?: string) =>
    render(
        <MantineProvider env="test">
            <MemoryRouter>
                <ForbiddenPanel subject={subject} />
            </MemoryRouter>
        </MantineProvider>,
    );

const GENERIC_TITLE = "You don't have access";
const NO_PROJECT_TITLE = "Your organization doesn't have a project yet";

describe('ForbiddenPanel', () => {
    beforeEach(() => {
        state.needsProject = false;
        state.isInitialLoading = false;
        state.canAskForSampleData = false;
    });

    it('asks a non-admin to request sample data when the org has no project', () => {
        state.needsProject = true;
        state.canAskForSampleData = true;
        renderForbiddenPanel();

        expect(
            screen.getByText(/Ask an admin to add sample data/),
        ).toBeInTheDocument();
    });

    it('does not mention sample data when it is not available', () => {
        state.needsProject = true;
        renderForbiddenPanel();

        expect(
            screen.queryByText(/Ask an admin to add sample data/),
        ).not.toBeInTheDocument();
    });

    it('explains the missing project when the organization has none', () => {
        state.needsProject = true;
        renderForbiddenPanel();

        expect(screen.getByText(NO_PROJECT_TITLE)).toBeInTheDocument();
        expect(
            screen.getByText(/A project connects Lightdash to your data/),
        ).toBeInTheDocument();
        expect(screen.queryByText(GENERIC_TITLE)).not.toBeInTheDocument();
    });

    it('keeps the generic access message when the organization has a project', () => {
        renderForbiddenPanel();

        expect(screen.getByText(GENERIC_TITLE)).toBeInTheDocument();
        expect(
            screen.getByText('Please contact the admin to request access.'),
        ).toBeInTheDocument();
        expect(screen.queryByText(NO_PROJECT_TITLE)).not.toBeInTheDocument();
    });

    it('names the subject in the generic access message', () => {
        renderForbiddenPanel('project');

        expect(
            screen.getByText("You don't have access to this project"),
        ).toBeInTheDocument();
    });

    it('shows neither message while the organization is still loading', () => {
        state.isInitialLoading = true;
        renderForbiddenPanel();

        expect(screen.queryByText(GENERIC_TITLE)).not.toBeInTheDocument();
        expect(screen.queryByText(NO_PROJECT_TITLE)).not.toBeInTheDocument();
    });
});
