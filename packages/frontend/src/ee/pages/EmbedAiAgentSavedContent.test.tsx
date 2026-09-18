import { JWT_HEADER_NAME } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import nock from 'nock';
import { useContext } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BASE_API_URL, networkHistory } from '../../api';
import { renderWithProviders } from '../../testing/testUtils';
import {
    clearInMemoryStorage,
    setToInMemoryStorage,
} from '../../utils/inMemoryStorage';
import EmbedProviderContext from '../providers/Embed/context';
import { EMBED_KEY } from '../providers/Embed/types';
import EmbedAiAgentSavedContent from './EmbedAiAgentSavedContent';

const originalLocation = window.location;
const endpoint =
    '/api/v1/projects/project/aiAgents/agent/saved-content/chart/chart-slug/embed-url';
const Example = () => {
    const defaults = useContext(EmbedProviderContext);
    return (
        <EmbedProviderContext.Provider
            value={{
                ...defaults,
                projectUuid: 'project',
                embedToken: 'agent-token',
            }}
        >
            <EmbedAiAgentSavedContent />
        </EmbedProviderContext.Provider>
    );
};
const renderPage = () =>
    renderWithProviders(
        <MemoryRouter
            initialEntries={[
                '/embed/project/ai-agents/agent/saved-content/chart/chart-slug?theme=dark',
            ]}
        >
            <Routes>
                <Route
                    path="/embed/:projectUuid/ai-agents/:agentUuid/saved-content/:contentType/:contentUuidOrSlug"
                    element={<Example />}
                />
            </Routes>
        </MemoryRouter>,
    );

describe('saved content embed handoff', () => {
    beforeEach(() => {
        Object.defineProperty(window, 'location', {
            value: { origin: originalLocation.origin, replace: vi.fn() },
            configurable: true,
        });
        setToInMemoryStorage(EMBED_KEY, {
            projectUuid: 'project',
            token: 'agent-token',
        });
    });
    afterEach(() => {
        Object.defineProperty(window, 'location', {
            value: originalLocation,
            configurable: true,
        });
        clearInMemoryStorage();
    });

    it('authenticates without a session and opens the scoped viewer without replacing the chat token', async () => {
        const scope = nock(BASE_API_URL, {
            reqheaders: { [JWT_HEADER_NAME]: 'agent-token' },
        })
            .post(endpoint)
            .query(true)
            .reply(200, {
                status: 'ok',
                results: {
                    url: 'https://lightdash.example/embed/project/chart/resolved-id#content-token',
                },
            });
        renderPage();
        await waitFor(() =>
            expect(window.location.replace).toHaveBeenCalledWith(
                'https://lightdash.example/embed/project/chart/resolved-id?theme=dark#content-token',
            ),
        );
        expect(scope.isDone()).toBe(true);
        expect(JSON.stringify(networkHistory)).not.toContain('content-token');
    });

    it('keeps authorization errors inside the embed rather than navigating to the app', async () => {
        const scope = nock(BASE_API_URL)
            .post(endpoint)
            .query(true)
            .reply(403, {
                status: 'error',
                error: {
                    statusCode: 403,
                    name: 'ForbiddenError',
                    message: 'Saved content is outside the embedded space',
                },
            });
        renderPage();
        expect(
            await screen.findByText(
                'Saved content is outside the embedded space',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Unable to open saved content'),
        ).toBeInTheDocument();
        expect(window.location.replace).not.toHaveBeenCalled();
        expect(scope.isDone()).toBe(true);
    });
});
