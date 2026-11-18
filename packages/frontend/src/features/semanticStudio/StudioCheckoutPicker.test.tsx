import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { draftModel, draftOf, workspaceOf } from './studioCheckout.mock';
import { StudioCheckoutPicker } from './StudioCheckoutPicker';
import {
    StudioCheckoutProvider,
    type StudioCheckoutState,
} from './useStudioCheckout';

const mutate = vi.hoisted(() => vi.fn());
const A = workspaceOf('A');
const B = workspaceOf('B');
vi.mock('./useStudioWorkspaces', () => ({
    useStudioWorkspaces: () => ({
        data: { mine: [A, B], others: [], recent: [] },
    }),
    useStudioWorkspaceAction: () => ({
        mutate,
        isLoading: false,
        isError: false,
    }),
}));

const on = (
    workspace: typeof A | null,
    isSwitching = false,
): StudioCheckoutState => ({
    shown: {
        workspace,
        draft: workspace ? draftOf([draftModel('orders', 'a', 'b')]) : null,
    },
    isSwitching,
    error: null,
});

const picker = (state: StudioCheckoutState) => (
    <StudioCheckoutProvider value={state}>
        <StudioCheckoutPicker projectUuid="project" onShowChanges={null} />
    </StudioCheckoutProvider>
);

const trigger = () => screen.getByRole('button', { name: /Change|Live/ });

describe('StudioCheckoutPicker', () => {
    it('checks out B from A, keeps A until B has loaded, then goes back to Live', async () => {
        const user = userEvent.setup();
        const { rerender } = renderWithProviders(picker(on(A)));
        expect(trigger()).toHaveTextContent('Change A');

        await user.click(trigger());
        await user.click(
            await screen.findByRole('menuitem', { name: 'Change B' }),
        );
        expect(mutate).toHaveBeenLastCalledWith(
            { kind: 'activate', workspaceUuid: 'B' },
            expect.anything(),
        );

        rerender(picker(on(A, true)));
        expect(trigger()).toHaveTextContent('Change A');
        expect(trigger()).toHaveAttribute('aria-busy', 'true');
        expect(screen.getByRole('status')).toHaveTextContent('Checking out');

        rerender(picker(on(B)));
        expect(trigger()).toHaveTextContent('Change B');
        expect(screen.getByRole('status')).toHaveTextContent(
            'Change B is checked out',
        );

        await user.click(trigger());
        await user.click(await screen.findByRole('menuitem', { name: 'Live' }));
        expect(mutate).toHaveBeenLastCalledWith(
            { kind: 'leave' },
            expect.anything(),
        );
    });

    it('creates a change directly from the current checkout', async () => {
        const user = userEvent.setup();
        renderWithProviders(picker(on(A)));
        await user.click(trigger());
        await user.click(
            await screen.findByRole('menuitem', { name: 'New change' }),
        );
        expect(mutate).toHaveBeenLastCalledWith(
            {
                kind: 'start',
                body: { threadUuid: null, name: 'Untitled change' },
            },
            expect.anything(),
        );
    });

    it('does nothing for the change already checked out', async () => {
        mutate.mockClear();
        const user = userEvent.setup();
        renderWithProviders(picker(on(A)));
        await user.click(trigger());
        await user.click(
            await screen.findByRole('menuitem', { name: 'Change A' }),
        );
        expect(mutate).not.toHaveBeenCalled();
    });
});
