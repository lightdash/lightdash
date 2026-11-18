import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { workspaceOf } from './studioCheckout.mock';
import { toStudioRun } from './studioRuns';
import { StudioWorkspacesList } from './StudioWorkspacesList';

const current = workspaceOf('A', { isActive: true });
const mine = workspaceOf('B');
const teammates = workspaceOf('C', {
    isMine: false,
    owner: { userUuid: 'them', name: 'Sam' },
});
vi.mock('./useStudioWorkspaces', () => ({
    useStudioWorkspaces: () => ({
        data: { mine: [current, mine], others: [teammates], recent: [] },
        isInitialLoading: false,
        error: null,
    }),
}));
vi.mock('./useStudioRuns', () => ({
    useStudioRuns: (_projectUuid: string, workspaces: (typeof current)[]) =>
        workspaces.map((workspace) => ({
            workspace,
            run: toStudioRun(workspace, { savingStep: null, ciChecks: null }),
        })),
}));

const renderList = () => {
    const onOpen = vi.fn();
    const onCheckOut = vi.fn();
    renderWithProviders(
        <StudioWorkspacesList
            projectUuid="project"
            saving={null}
            onOpen={onOpen}
            onCheckOut={onCheckOut}
            isCheckingOut={false}
        />,
    );
    return { onOpen, onCheckOut };
};

describe('StudioWorkspacesList', () => {
    it('checks out one of your open changes from its row', async () => {
        const user = userEvent.setup();
        const { onOpen, onCheckOut } = renderList();
        const buttons = screen.getAllByRole('button', { name: 'Check out' });
        // The change already checked out has nothing to check out.
        expect(buttons).toHaveLength(1);
        await user.click(buttons[0]);
        expect(onCheckOut).toHaveBeenCalledWith(mine);
        expect(onOpen).not.toHaveBeenCalled();
    });

    it("opens a teammate's change without checking it out", async () => {
        const user = userEvent.setup();
        const { onOpen, onCheckOut } = renderList();
        await user.click(screen.getByRole('button', { name: /Change C/ }));
        expect(onOpen).toHaveBeenCalledWith(teammates);
        expect(onCheckOut).not.toHaveBeenCalled();
    });
});
