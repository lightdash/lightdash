import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { draftModel, draftOf, workspaceOf } from './studioCheckout.mock';
import { StudioCheckoutPicker } from './StudioCheckoutPicker';
import {
    StudioCheckoutProvider,
    type StudioCheckoutState,
} from './useStudioCheckout';

const A = workspaceOf('A');
const B = workspaceOf('B');

const api = vi.hoisted(() => vi.fn());
vi.mock('../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => api,
}));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: true } }),
}));

beforeEach(() => {
    api.mockReset();
    api.mockImplementation(
        ({ url, method }: { url: string; method: string }) => {
            if (url.endsWith('/semantic-studio/status')) {
                return Promise.resolve({
                    enabled: true,
                    blocker: null,
                    appliesAs: 'live',
                });
            }
            if (url.endsWith('/semantic-studio/workspaces')) {
                return Promise.resolve({
                    mine: [A, B],
                    others: [],
                    recent: [],
                });
            }
            if (
                method === 'POST' &&
                url.includes('/semantic-studio/workspaces')
            ) {
                return Promise.resolve(undefined);
            }
            return Promise.resolve(null);
        },
    );
});

const on = (workspace: typeof A | null): StudioCheckoutState => ({
    shown: {
        workspace,
        draft: workspace ? draftOf([draftModel('orders', 'a', 'b')]) : null,
    },
    isSwitching: false,
    error: null,
});

const picker = (state: StudioCheckoutState) => (
    <StudioCheckoutProvider value={state}>
        <StudioCheckoutPicker projectUuid="project" onShowChanges={null} />
    </StudioCheckoutProvider>
);

const trigger = () => screen.getByRole('button', { name: /Draft|Published/ });

const posted = (path: string, body?: unknown) =>
    waitFor(() =>
        expect(api).toHaveBeenCalledWith(
            expect.objectContaining({
                url: `/projects/project/semantic-studio/workspaces${path}`,
                method: 'POST',
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            }),
        ),
    );

describe('StudioCheckoutPicker', () => {
    it('checks out another draft, then goes back to Published', async () => {
        const user = userEvent.setup();
        renderWithProviders(picker(on(A)));
        expect(trigger()).toHaveAccessibleName('Draft: Change A');

        await user.click(trigger());
        await user.click(
            await screen.findByRole('menuitem', { name: /^Change B/ }),
        );
        await posted('/B/activate');
        await waitFor(() =>
            expect(trigger()).not.toHaveAttribute('aria-busy', 'true'),
        );

        await user.click(trigger());
        await user.click(
            await screen.findByRole('menuitem', { name: 'Back to Published' }),
        );
        await posted('/leave');
    });

    it('creates a change directly from the current checkout', async () => {
        const user = userEvent.setup();
        renderWithProviders(picker(on(A)));
        await user.click(trigger());
        await user.click(
            await screen.findByRole('menuitem', { name: 'New draft' }),
        );
        await posted('', { threadUuid: null, name: 'Untitled' });
    });

    it('lists where you can go, not where you are', async () => {
        const user = userEvent.setup();
        renderWithProviders(picker(on(A)));
        await user.click(trigger());
        expect(
            await screen.findByRole('menuitem', { name: /^Change B/ }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('menuitem', { name: /^Change A/ }),
        ).not.toBeInTheDocument();
    });
});
