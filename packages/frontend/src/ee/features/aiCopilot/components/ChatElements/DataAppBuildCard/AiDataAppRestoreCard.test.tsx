import {
    type ApiAppVersionSummary,
    type ApiGetAppResponse,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../../../../api';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { store } from '../../../store';
import { clearPreview, setPreview } from '../../../store/aiArtifactSlice';
import { AiDataAppRestoreCard } from './AiDataAppRestoreCard';
import { type DataAppRestoreContextItem } from './dataAppBuildCardState';

vi.mock('../../../../../../api', () => ({ lightdashApi: vi.fn() }));
const mockedLightdashApi = vi.mocked(lightdashApi);

const APP_UUID = 'app-1';
const IDS = {
    projectUuid: 'project-1',
    agentUuid: 'agent-1',
    threadUuid: 'thread-1',
    messageUuid: 'message-1',
};

const readyVersion = (v: number): ApiAppVersionSummary => ({
    version: v,
    prompt: 'Build me a revenue app',
    status: 'ready',
    statusMessage: null,
    statusHistory: [],
    error: null,
    createdAt: new Date('2026-08-28T10:00:00.000Z'),
    statusUpdatedAt: new Date('2026-08-28T10:00:30.000Z'),
    createdByUser: null,
    resources: null,
});

const app: ApiGetAppResponse['results'] = {
    appUuid: APP_UUID,
    name: 'Revenue app',
    description: '',
    createdByUserUuid: 'user-1',
    spaceUuid: null,
    spaceName: null,
    registrySlug: null,
    template: null,
    pinnedListUuid: null,
    pinnedListOrder: null,
    slug: 'revenue-app',
    views: 0,
    versions: [readyVersion(3), readyVersion(2), readyVersion(1)],
    hasMore: false,
    latestReadyVersion: 3,
};

const item: DataAppRestoreContextItem = {
    type: 'data_app_restore',
    appUuid: APP_UUID,
    version: 3,
    restoredFromVersion: 1,
    appSlug: 'revenue-app',
    displayName: 'Revenue app',
};

const renderCard = (compact = false, restore = item) =>
    renderWithProviders(
        <Provider store={store}>
            <MemoryRouter>
                <div data-testid="host">
                    <AiDataAppRestoreCard
                        item={restore}
                        completionMessage="Restored version 1 as version 3."
                        compact={compact}
                        {...IDS}
                    />
                </div>
            </MemoryRouter>
        </Provider>,
    );

const cardPaper = () => screen.getByTestId('host').firstElementChild;

describe('AiDataAppRestoreCard', () => {
    beforeEach(() => {
        store.dispatch(clearPreview());
        mockedLightdashApi.mockReset();
        mockedLightdashApi.mockResolvedValue(app);
    });

    it('is a ready card naming the restored version and View opens it', async () => {
        renderCard(false, { ...item, displayName: null });

        expect(screen.getByText('v3 · restored from v1')).toBeVisible();
        expect(
            screen.getByText('Restored version 1 as version 3.'),
        ).toBeVisible();
        expect(cardPaper()?.className).not.toMatch(/cardActive/);

        // The name lands with the app; the open then records latest ready.
        expect(await screen.findByText('Revenue app')).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: 'View' }));

        expect(store.getState().aiArtifact.preview).toEqual({
            type: 'dataApp',
            appUuid: APP_UUID,
            ...IDS,
            version: 3,
            latestReadyVersionAtOpen: 3,
        });
        expect(cardPaper()?.className).toMatch(/cardActive/);
    });

    it('records its own version as the floor when View beats the app fetch', () => {
        mockedLightdashApi.mockReturnValue(new Promise(() => {}));
        renderCard();

        fireEvent.click(screen.getByRole('button', { name: 'View' }));

        expect(store.getState().aiArtifact.preview).toMatchObject({
            version: 3,
            latestReadyVersionAtOpen: 3,
        });
    });

    it('is only active when the preview shows its version', async () => {
        store.dispatch(
            setPreview({
                type: 'dataApp',
                appUuid: APP_UUID,
                ...IDS,
                version: 1,
                latestReadyVersionAtOpen: 3,
            }),
        );
        renderCard(true);

        expect(await screen.findByText('v3 · restored from v1')).toBeVisible();
        expect(cardPaper()?.className).not.toMatch(/cardActive/);
    });

    it('is unavailable when the app is gone', async () => {
        mockedLightdashApi.mockRejectedValue({
            status: 'error',
            error: { statusCode: 404, name: 'NotFoundError', message: '' },
        });
        renderCard();

        expect(
            await screen.findByText('This app is no longer available.'),
        ).toBeVisible();
    });
});
