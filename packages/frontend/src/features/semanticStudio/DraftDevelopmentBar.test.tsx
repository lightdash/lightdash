import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { store } from '../../ee/features/aiCopilot/store';
import {
    markTurnFinished,
    startStreaming,
    stopStreaming,
} from '../../ee/features/aiCopilot/store/aiAgentThreadStreamSlice';
import { renderWithProviders } from '../../testing/testUtils';
import { DraftDevelopmentBar } from './SemanticLayerDraft';
import { draftModel, draftOf } from './studioCheckout.mock';
import type * as SemanticLayerModel from './useSemanticLayerModel';
import type * as StudioCheckout from './useStudioCheckout';

const draft = {
    ...draftOf([draftModel('orders', 'a', 'b')]),
    changes: [
        {
            draftChangeUuid: 'change',
            question: null,
            createdAt: new Date(),
            models: [
                { model: 'orders', changes: [], refusals: [], error: null },
            ],
        },
    ],
};

vi.mock('./useSemanticLayerModel', async (importOriginal) => ({
    ...(await importOriginal<typeof SemanticLayerModel>()),
    useSemanticLayerDraft: () => ({ data: draft }),
    useSemanticLayerDraftImpact: () => ({ data: undefined }),
    useCheckSemanticLayerDraftImpact: () => ({
        isLoading: false,
        mutate: vi.fn(),
    }),
    useDiscardSemanticLayerDraft: () => ({ isLoading: false, mutate: vi.fn() }),
    usePublishMode: () => 'live',
}));
vi.mock('./useStudioCheckout', async (importOriginal) => ({
    ...(await importOriginal<typeof StudioCheckout>()),
    useDraftPullRequest: () => null,
}));

const THREAD = 'thread';

const stream = (isOn: boolean) =>
    act(() => {
        store.dispatch(
            isOn
                ? startStreaming({
                      threadUuid: THREAD,
                      messageUuid: 'message',
                      projectUuid: 'project',
                      agentUuid: 'agent',
                      autoApproveSql: false,
                  })
                : stopStreaming({ threadUuid: THREAD }),
        );
    });

const renderBar = () =>
    renderWithProviders(
        <Provider store={store}>
            <MemoryRouter>
                <DraftDevelopmentBar
                    projectUuid="project"
                    onDiscarded={vi.fn()}
                />
            </MemoryRouter>
        </Provider>,
    );

const publish = () => screen.getByRole('button', { name: 'Publish' });

beforeEach(() => {
    localStorage.setItem(
        'semantic-studio-agent-thread-project',
        JSON.stringify({ agentUuid: 'agent', threadUuid: THREAD }),
    );
});

afterEach(() => {
    stream(false);
    localStorage.clear();
});

describe('DraftDevelopmentBar while the agent is working', () => {
    it('shows Publish as in progress with a reason a keyboard reaches', async () => {
        stream(true);
        renderBar();

        expect(publish()).toHaveAttribute('aria-disabled', 'true');
        expect(publish()).toHaveAttribute('aria-busy', 'true');
        expect(publish()).not.toHaveAttribute('data-disabled');
        await userEvent.tab();
        expect(publish()).toHaveFocus();
        expect(
            await screen.findByText(
                'The agent is still working on this change.',
            ),
        ).toBeInTheDocument();

        await userEvent.click(publish());
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('offers Publish again once the turn ends, without a reload', () => {
        stream(true);
        renderBar();
        expect(publish()).toHaveAttribute('aria-disabled', 'true');

        stream(false);

        expect(publish()).toHaveAttribute('aria-disabled', 'false');
        expect(publish()).toHaveAttribute('aria-busy', 'false');
        expect(publish()).not.toHaveAttribute('data-disabled');
    });

    it('offers Publish once the turn finishes, even if the connection stays open', () => {
        stream(true);
        renderBar();
        expect(publish()).toHaveAttribute('aria-busy', 'true');

        act(() => {
            store.dispatch(markTurnFinished({ threadUuid: THREAD }));
        });

        expect(publish()).toHaveAttribute('aria-disabled', 'false');
        expect(publish()).toHaveAttribute('aria-busy', 'false');
    });
});
