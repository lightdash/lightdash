import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, useEffect, useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { store } from '../../store';
import { openPanel, resetActivePanel } from '../../store/aiAgentLauncherSlice';
import styles from './AiAgentsLauncher.module.css';
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
        expect(screen.getByTestId('launcher').parentElement).toHaveClass(
            styles.portalContainer,
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

    it('preserves launcher state while moving into and out of a modal host', async () => {
        const user = userEvent.setup();
        const lifecycle = { mounts: 0, unmounts: 0 };
        const StatefulLauncher = () => {
            const [draft, setDraft] = useState('');
            useEffect(() => {
                lifecycle.mounts += 1;
                return () => {
                    lifecycle.unmounts += 1;
                };
            }, []);
            return (
                <input
                    aria-label="Draft"
                    value={draft}
                    onChange={(event) => setDraft(event.currentTarget.value)}
                />
            );
        };
        const Harness = () => {
            const [isModalOpen, setIsModalOpen] = useState(false);
            return (
                <>
                    <button
                        type="button"
                        onClick={() => setIsModalOpen((opened) => !opened)}
                    >
                        Toggle modal
                    </button>
                    {isModalOpen && (
                        <div role="dialog">
                            <AiAgentsLauncherModalHost />
                        </div>
                    )}
                    <AiAgentsLauncherPortal>
                        <StatefulLauncher />
                    </AiAgentsLauncherPortal>
                </>
            );
        };
        renderWithProviders(<Harness />);

        const draft = await screen.findByRole('textbox', { name: 'Draft' });
        await user.type(draft, 'Unsaved question');
        await user.click(screen.getByRole('button', { name: 'Toggle modal' }));

        await waitFor(() =>
            expect(screen.getByRole('dialog')).toContainElement(
                screen.getByRole('textbox', { name: 'Draft' }),
            ),
        );
        const modalDraft = screen.getByRole('textbox', { name: 'Draft' });
        expect(modalDraft).toHaveValue('Unsaved question');
        expect(modalDraft).toBe(draft);
        expect(lifecycle).toEqual({ mounts: 1, unmounts: 0 });

        await user.click(screen.getByRole('button', { name: 'Toggle modal' }));

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        const pageDraft = screen.getByRole('textbox', { name: 'Draft' });
        expect(pageDraft).toHaveValue('Unsaved question');
        expect(pageDraft).toBe(draft);
        expect(lifecycle).toEqual({ mounts: 1, unmounts: 0 });
    });

    it('collapses a hosted conversation when the modal closes', async () => {
        store.dispatch(openPanel({ threadId: null, agentUuid: 'agent-uuid' }));
        const Harness = ({ isModalOpen }: { isModalOpen: boolean }) => (
            <>
                {isModalOpen && (
                    <div role="dialog">
                        <AiAgentsLauncherModalHost />
                    </div>
                )}
                <AiAgentsLauncherPortal>
                    <button type="button">Conversation input</button>
                </AiAgentsLauncherPortal>
            </>
        );
        const { rerender } = renderWithProviders(
            <Harness isModalOpen={true} />,
        );

        await waitFor(() =>
            expect(screen.getByRole('dialog')).toContainElement(
                screen.getByRole('button', { name: 'Conversation input' }),
            ),
        );

        rerender(<Harness isModalOpen={false} />);

        await waitFor(() =>
            expect(store.getState().aiAgentLauncher.mode).toBe('collapsed'),
        );
    });

    it('does not collapse an open conversation during the Strict Mode effect probe', async () => {
        const user = userEvent.setup();
        const Harness = () => {
            const [isModalOpen, setIsModalOpen] = useState(false);
            return (
                <>
                    <button type="button" onClick={() => setIsModalOpen(true)}>
                        Open modal
                    </button>
                    {isModalOpen && (
                        <div role="dialog">
                            <AiAgentsLauncherModalHost />
                        </div>
                    )}
                    <AiAgentsLauncherPortal>
                        <button type="button">Conversation input</button>
                    </AiAgentsLauncherPortal>
                </>
            );
        };
        renderWithProviders(
            <StrictMode>
                <Harness />
            </StrictMode>,
        );
        store.dispatch(openPanel({ threadId: null, agentUuid: 'agent-uuid' }));
        await user.click(screen.getByRole('button', { name: 'Open modal' }));

        await waitFor(() =>
            expect(screen.getByRole('dialog')).toContainElement(
                screen.getByRole('button', { name: 'Conversation input' }),
            ),
        );
        expect(store.getState().aiAgentLauncher.mode).toBe('panel-open');
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
