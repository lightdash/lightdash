import { type AiAgentMessageAssistant } from '@lightdash/common';
import { act, fireEvent, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { store } from '../../store';
import { clearPreview, setPreview } from '../../store/aiArtifactSlice';
import { ContentLink } from './ContentLink';

const APP_UUID = 'app-uuid-1';
const APP_HREF = `/projects/project-1/apps/${APP_UUID}/view`;

const message: AiAgentMessageAssistant = {
    role: 'assistant',
    status: 'idle',
    uuid: 'message-1',
    threadUuid: 'thread-1',
    message: 'Here is your app',
    errorMessage: null,
    interrupted: false,
    createdAt: '2026-08-26T09:00:00.000Z',
    humanScore: null,
    humanFeedback: null,
    toolCalls: [],
    toolResults: [],
    reasoning: [],
    savedQueryUuid: null,
    artifacts: null,
    referencedArtifacts: null,
    modelConfig: null,
    tokenUsage: null,
    responseTiming: null,
};

const renderDataAppChip = () =>
    renderWithProviders(
        <Provider store={store}>
            <MemoryRouter>
                <ContentLink
                    contentType="data-app-link"
                    props={{ href: APP_HREF, 'data-app-uuid': APP_UUID }}
                    message={message}
                    projectUuid="project-1"
                    agentUuid="agent-1"
                >
                    Revenue explorer
                </ContentLink>
            </MemoryRouter>
        </Provider>,
    );

describe('ContentLink data-app chip', () => {
    beforeEach(() => {
        store.dispatch(clearPreview());
    });

    it('opens the preview panel on plain left-click without navigating', () => {
        renderDataAppChip();

        const chip = screen.getByRole('link', { name: /Revenue explorer/ });
        const defaultNotPrevented = fireEvent.click(chip);

        expect(defaultNotPrevented).toBe(false);
        expect(store.getState().aiArtifact.preview).toEqual({
            type: 'dataApp',
            appUuid: APP_UUID,
            messageUuid: 'message-1',
            threadUuid: 'thread-1',
            projectUuid: 'project-1',
            agentUuid: 'agent-1',
            version: null,
            latestReadyVersionAtOpen: null,
        });
    });

    it.each([
        ['meta', { metaKey: true }],
        ['ctrl', { ctrlKey: true }],
        ['shift', { shiftKey: true }],
        ['middle-click', { button: 1 }],
    ])('leaves the store untouched on %s click', (_label, eventInit) => {
        renderDataAppChip();

        const chip = screen.getByRole('link', { name: /Revenue explorer/ });
        const defaultNotPrevented = fireEvent.click(chip, eventInit);

        expect(defaultNotPrevented).toBe(true);
        expect(store.getState().aiArtifact.preview).toBeNull();
    });

    it('opens the latest ready version even after a card pinned an older one', () => {
        renderDataAppChip();
        act(() => {
            store.dispatch(
                setPreview({
                    type: 'dataApp',
                    appUuid: APP_UUID,
                    messageUuid: 'message-1',
                    threadUuid: 'thread-1',
                    projectUuid: 'project-1',
                    agentUuid: 'agent-1',
                    version: 1,
                    latestReadyVersionAtOpen: 3,
                }),
            );
        });

        fireEvent.click(screen.getByRole('link', { name: /Revenue explorer/ }));

        expect(store.getState().aiArtifact.preview).toMatchObject({
            version: null,
            latestReadyVersionAtOpen: null,
        });
    });

    it('shows the active indicator only while its app is previewed', () => {
        renderDataAppChip();

        const chip = screen.getByRole('link', { name: /Revenue explorer/ });
        expect(chip).not.toHaveAttribute('data-app-active');

        fireEvent.click(chip);
        expect(chip).toHaveAttribute('data-app-active', 'true');

        act(() => {
            store.dispatch(clearPreview());
        });
        expect(chip).not.toHaveAttribute('data-app-active');
    });

    it('replaces a chart preview and is replaced by one', () => {
        renderDataAppChip();

        const chartPreview = {
            type: 'savedChart' as const,
            savedChartUuid: 'chart-1',
            messageUuid: 'message-1',
            threadUuid: 'thread-1',
            projectUuid: 'project-1',
            agentUuid: 'agent-1',
        };

        act(() => {
            store.dispatch(setPreview(chartPreview));
        });

        fireEvent.click(screen.getByRole('link', { name: /Revenue explorer/ }));
        expect(store.getState().aiArtifact.preview?.type).toBe('dataApp');

        act(() => {
            store.dispatch(setPreview(chartPreview));
        });
        expect(store.getState().aiArtifact.preview?.type).toBe('savedChart');
    });
});
