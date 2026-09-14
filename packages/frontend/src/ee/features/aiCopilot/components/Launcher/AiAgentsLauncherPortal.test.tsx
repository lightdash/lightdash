import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { store } from '../../store';
import { openPanel, resetActivePanel } from '../../store/aiAgentLauncherSlice';
import {
    AiAgentsLauncherModalHost,
    AiAgentsLauncherPortal,
} from './AiAgentsLauncherPortal';
import { shouldRenderAiAgentsLauncher } from './launcherVisibility';

describe('AiAgentsLauncherPortal', () => {
    beforeEach(() => {
        store.dispatch(resetActivePanel());
    });

    it('renders in the modal host when present', async () => {
        renderWithProviders(
            <>
                <div role="dialog">
                    <AiAgentsLauncherModalHost />
                </div>
                <AiAgentsLauncherPortal>
                    <div data-testid="launcher">AI conversation</div>
                </AiAgentsLauncherPortal>
            </>,
        );

        await waitFor(() =>
            expect(screen.getByRole('dialog')).toContainElement(
                screen.getByTestId('launcher'),
            ),
        );
    });

    it('keeps the normal page render when there is no modal host', () => {
        renderWithProviders(
            <div data-testid="page">
                <AiAgentsLauncherPortal>
                    <div data-testid="launcher">AI conversation</div>
                </AiAgentsLauncherPortal>
            </div>,
        );

        expect(screen.getByTestId('page')).toContainElement(
            screen.getByTestId('launcher'),
        );
    });

    it('allows the launcher on narrow screens only when the modal hosts it', () => {
        expect(
            shouldRenderAiAgentsLauncher({
                isHidden: false,
                isMobile: true,
                isModalHosted: true,
            }),
        ).toBe(true);
        expect(
            shouldRenderAiAgentsLauncher({
                isHidden: false,
                isMobile: true,
                isModalHosted: false,
            }),
        ).toBe(false);
    });

    it('keeps an artifact preview and its close control inside the modal', async () => {
        const user = userEvent.setup();
        const LauncherWithPreview = () => {
            const [isPreviewOpen, setIsPreviewOpen] = useState(true);
            return (
                <AiAgentsLauncherPortal>
                    <div data-testid="conversation">Conversation</div>
                    {isPreviewOpen && (
                        <div data-testid="preview">
                            <button
                                type="button"
                                onClick={() => setIsPreviewOpen(false)}
                            >
                                Close preview
                            </button>
                        </div>
                    )}
                </AiAgentsLauncherPortal>
            );
        };
        renderWithProviders(
            <>
                <div role="dialog">
                    <AiAgentsLauncherModalHost />
                </div>
                <LauncherWithPreview />
            </>,
        );

        await waitFor(() =>
            expect(screen.getByRole('dialog')).toContainElement(
                screen.getByTestId('preview'),
            ),
        );
        expect(screen.getByRole('dialog')).toContainElement(
            screen.getByTestId('conversation'),
        );

        await user.click(screen.getByRole('button', { name: 'Close preview' }));

        expect(screen.queryByTestId('preview')).toBeNull();
        expect(screen.getByTestId('conversation')).toBeVisible();
    });

    it('collapses a hosted conversation when the modal closes', () => {
        store.dispatch(openPanel({ threadId: null, agentUuid: 'agent-uuid' }));
        const { unmount } = renderWithProviders(<AiAgentsLauncherModalHost />);

        unmount();

        expect(store.getState().aiAgentLauncher.mode).toBe('collapsed');
    });

    it('collapses the conversation on Escape without passing it to the modal', async () => {
        const user = userEvent.setup();
        store.dispatch(openPanel({ threadId: null, agentUuid: 'agent-uuid' }));
        let escapedModal = false;
        const handleWindowKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') escapedModal = true;
        };
        window.addEventListener('keydown', handleWindowKeyDown);
        renderWithProviders(
            <>
                <div role="dialog">
                    <AiAgentsLauncherModalHost />
                </div>
                <AiAgentsLauncherPortal>
                    <button type="button">Conversation input</button>
                </AiAgentsLauncherPortal>
            </>,
        );

        const input = await screen.findByRole('button', {
            name: 'Conversation input',
        });
        await user.click(input);
        expect(input).toHaveFocus();
        await user.keyboard('{Escape}');
        window.removeEventListener('keydown', handleWindowKeyDown);

        expect(store.getState().aiAgentLauncher.mode).toBe('collapsed');
        expect(escapedModal).toBe(false);
    });
});
