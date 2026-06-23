import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { AiReviewsSettingsPage } from './AiReviewsSettingsPage';

const mockTable = vi.fn();

vi.mock('../../../../../../hooks/useGuidedTour', () => ({
    useGuidedTour: () => ({
        isOpen: false,
        startTour: vi.fn(),
        closeTour: vi.fn(),
    }),
}));

vi.mock('../../../hooks/useAiOrganizationSettings', () => ({
    useAiOrganizationSettings: () => ({
        data: { aiAgentsVisible: true },
    }),
}));

vi.mock('../../../../../../components/common/GuidedTour', () => ({
    GuidedTour: () => null,
}));

vi.mock('../AiAgentAdminReviewItemsTable', () => ({
    default: (props: {
        onReviewItemSelect?: (target: {
            projectUuid: string;
            agentUuid: string;
            threadUuid: string;
            reviewItemUuid?: string | null;
        }) => void;
    }) => {
        mockTable(props);
        return (
            <button
                type="button"
                onClick={() =>
                    props.onReviewItemSelect?.({
                        projectUuid: 'project-1',
                        agentUuid: 'agent-1',
                        threadUuid: 'thread-1',
                        reviewItemUuid: 'demo-review:1',
                    })
                }
            >
                Open issue
            </button>
        );
    },
}));

vi.mock('../ReviewKanbanBoard', () => ({
    ReviewKanbanBoard: () => <div>Board view</div>,
}));

vi.mock('../ThreadPreviewSidebar', () => ({
    ThreadPreviewSidebar: (props: {
        threadUuid: string;
        selectedReviewItemUuid?: string;
    }) => (
        <div>
            Sidebar thread {props.threadUuid} / {props.selectedReviewItemUuid}
        </div>
    ),
}));

describe('AiReviewsSettingsPage', () => {
    beforeEach(() => {
        mockTable.mockReset();
        localStorage.clear();
    });

    it('opens the drawer after selecting an issue from the table', async () => {
        const user = userEvent.setup();

        renderWithProviders(
            <MemoryRouter initialEntries={['/generalSettings/ai/issues']}>
                <Routes>
                    <Route
                        path="/generalSettings/ai/issues"
                        element={<AiReviewsSettingsPage />}
                    />
                </Routes>
            </MemoryRouter>,
        );

        // Board is the default view; switch to the table for this flow.
        await user.click(screen.getByText('Table'));
        await user.click(screen.getByRole('button', { name: 'Open issue' }));

        expect(
            await screen.findByText('Sidebar thread thread-1 / demo-review:1'),
        ).toBeInTheDocument();
    });

    it('reopens the selected drawer from URL search params', () => {
        renderWithProviders(
            <MemoryRouter
                initialEntries={[
                    '/generalSettings/ai/issues?reviewProjectUuid=project-1&reviewAgentUuid=agent-1&reviewThreadUuid=thread-1&reviewItemUuid=demo-review:1',
                ]}
            >
                <Routes>
                    <Route
                        path="/generalSettings/ai/issues"
                        element={<AiReviewsSettingsPage />}
                    />
                </Routes>
            </MemoryRouter>,
        );

        expect(
            screen.getByText('Sidebar thread thread-1 / demo-review:1'),
        ).toBeInTheDocument();
    });
});
