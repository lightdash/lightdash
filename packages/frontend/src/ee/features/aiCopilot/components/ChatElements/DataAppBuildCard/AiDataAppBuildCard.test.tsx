import {
    type ApiAppVersionSummary,
    type ApiGetAppResponse,
    type ToolGenerateDataAppOutput,
} from '@lightdash/common';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import {
    afterAll,
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { lightdashApi } from '../../../../../../api';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { store } from '../../../store';
import { clearPreview } from '../../../store/aiArtifactSlice';
import {
    clearBuildWatches,
    getBuildWatchKey,
} from '../../../store/buildWatchesSlice';
import { AiAgentBuildWatcher } from '../../Launcher/AiAgentBuildWatcher';
import {
    AiDataAppBuildCard,
    type DataAppBuildOrigin,
} from './AiDataAppBuildCard';

vi.mock('../../../../../../api', () => ({ lightdashApi: vi.fn() }));
const mockedLightdashApi = vi.mocked(lightdashApi);

// The build watcher's poller runs in a Web Worker; jsdom has none. The stub
// keeps the last instance so a test can hand it a poll result.
class WorkerStub {
    static last: WorkerStub | null = null;

    onmessage: ((event: MessageEvent) => void) | null = null;

    constructor() {
        WorkerStub.last = this;
    }

    postMessage() {}

    terminate() {
        this.onmessage = null;
    }
}
vi.stubGlobal('Worker', WorkerStub);
const originalObjectUrl = {
    createObjectURL: URL.createObjectURL,
    revokeObjectURL: URL.revokeObjectURL,
};
URL.createObjectURL = vi.fn(() => 'blob:poller');
URL.revokeObjectURL = vi.fn();
afterAll(() => {
    vi.unstubAllGlobals();
    Object.assign(URL, originalObjectUrl);
});

const APP_UUID = 'app-1';
const IDS = {
    projectUuid: 'project-1',
    agentUuid: 'agent-1',
    threadUuid: 'thread-1',
    messageUuid: 'message-1',
};

const expectedPreview = {
    type: 'dataApp',
    appUuid: APP_UUID,
    ...IDS,
    version: 1,
    latestReadyVersionAtOpen: 1,
};

const version = (
    overrides: Partial<ApiAppVersionSummary>,
): ApiAppVersionSummary => ({
    version: 1,
    threadUuid: 'app-thread-1',
    threadNumber: 1,
    prompt: 'Build me a revenue app',
    status: 'generating',
    statusMessage: null,
    statusHistory: [],
    error: null,
    createdAt: new Date('2026-08-28T10:00:00.000Z'),
    statusUpdatedAt: null,
    createdByUser: null,
    resources: null,
    ...overrides,
});

const app = (
    versions: ApiAppVersionSummary[],
): ApiGetAppResponse['results'] => ({
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
    currentThread: {
        uuid: 'app-thread-1',
        number: 1,
        createdAt: new Date('2026-08-28T09:00:00.000Z'),
    },
    versions,
    hasMore: false,
    latestReadyVersion:
        versions.find((v) => v.status === 'ready')?.version ?? null,
    icon: null,
    verification: null,
    autoAnalysis: 'inherit',
});

const pending: ToolGenerateDataAppOutput['metadata'] = {
    status: 'pending',
    appUuid: APP_UUID,
    version: 1,
};

const renderCard = (
    metadata: ToolGenerateDataAppOutput['metadata'],
    {
        withWatcher = false,
        origin = 'persisted',
    }: { withWatcher?: boolean; origin?: DataAppBuildOrigin } = {},
) =>
    renderWithProviders(
        <Provider store={store}>
            <MemoryRouter>
                {withWatcher && <AiAgentBuildWatcher />}
                <div data-testid="host">
                    <AiDataAppBuildCard
                        metadata={metadata}
                        origin={origin}
                        compact={false}
                        {...IDS}
                    />
                </div>
            </MemoryRouter>
        </Provider>,
    );

const pollResult = (versions: ApiAppVersionSummary[]) =>
    act(() => {
        WorkerStub.last?.onmessage?.({
            data: { type: 'data', results: app(versions) },
        } as MessageEvent);
    });

describe('AiDataAppBuildCard', () => {
    beforeEach(() => {
        store.dispatch(clearPreview());
        store.dispatch(clearBuildWatches());
        WorkerStub.last = null;
        mockedLightdashApi.mockReset();
    });

    // Drain React Query's queued notifications before RTL unmounts, so no
    // listener fires after the jsdom window is torn down.
    afterEach(async () => {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        vi.restoreAllMocks();
    });

    it('opens the preview when a build starts and follows it to ready', async () => {
        mockedLightdashApi.mockResolvedValue(
            app([
                version({
                    status: 'generating',
                    statusMessage: 'Generating your app',
                }),
            ]),
        );
        renderCard(pending, { withWatcher: true, origin: 'stream' });

        expect(await screen.findByText('Generating your app')).toBeVisible();
        // Opened at the app's latest ready version, which is none yet.
        expect(store.getState().aiArtifact.preview).toEqual({
            ...expectedPreview,
            version: null,
            latestReadyVersionAtOpen: null,
        });

        // Closing the panel sticks: landing does not reopen it.
        act(() => {
            store.dispatch(clearPreview());
        });
        pollResult([
            version({
                status: 'ready',
                statusMessage: 'Your revenue app is ready.',
                statusUpdatedAt: new Date('2026-08-28T10:06:12.000Z'),
            }),
        ]);

        expect(await screen.findByText('v1 · built in 6m 12s')).toBeVisible();
        expect(screen.getByText('Revenue app')).toBeVisible();
        expect(store.getState().buildWatches.watches).toEqual({});
        expect(store.getState().aiArtifact.preview).toBeNull();

        // View brings it back at the landed version.
        fireEvent.click(screen.getByRole('button', { name: 'View' }));
        expect(store.getState().aiArtifact.preview).toEqual(expectedPreview);
    });

    it('starts a build watch for a pending build instead of polling itself', async () => {
        mockedLightdashApi.mockResolvedValue(
            app([version({ status: 'generating' })]),
        );
        renderCard(pending);

        expect(await screen.findByText('Building your app')).toBeVisible();
        // A build loaded from the message (reload) never opens the preview.
        expect(store.getState().aiArtifact.preview).toBeNull();
        expect(store.getState().buildWatches.watches).toEqual({
            [getBuildWatchKey({ appUuid: APP_UUID, version: 1 })]: {
                appUuid: APP_UUID,
                version: 1,
                ...IDS,
                appName: 'Revenue app',
            },
        });
        expect(WorkerStub.last).toBeNull();
    });

    it('opens its own version and is the only active card for it', async () => {
        const builtAt = new Date('2026-08-28T10:00:30.000Z');
        const readyApp = app([
            version({ version: 2, status: 'ready', statusUpdatedAt: builtAt }),
            version({ version: 1, status: 'ready', statusUpdatedAt: builtAt }),
        ]);
        mockedLightdashApi.mockResolvedValue(readyApp);
        const success = (v: number): ToolGenerateDataAppOutput['metadata'] => ({
            status: 'success',
            appUuid: APP_UUID,
            version: v,
            name: 'Revenue app',
            href: '/projects/project-1/apps/app-1',
        });
        renderWithProviders(
            <Provider store={store}>
                <MemoryRouter>
                    <div data-testid="card-1">
                        <AiDataAppBuildCard
                            metadata={success(1)}
                            origin="persisted"
                            compact={false}
                            {...IDS}
                        />
                    </div>
                    <div data-testid="card-2">
                        <AiDataAppBuildCard
                            metadata={success(2)}
                            origin="persisted"
                            compact={false}
                            {...IDS}
                        />
                    </div>
                </MemoryRouter>
            </Provider>,
        );
        // Both cards read the same app; wait for it to fill in the subtitles.
        expect(await screen.findByText('v1 · built in 30s')).toBeVisible();
        expect(await screen.findByText('v2 · built in 30s')).toBeVisible();
        const cardPaper = (id: string) =>
            screen.getByTestId(id).firstElementChild;

        fireEvent.click(screen.getAllByRole('button', { name: 'View' })[0]);

        expect(store.getState().aiArtifact.preview).toEqual({
            ...expectedPreview,
            version: 1,
            latestReadyVersionAtOpen: 2,
        });
        expect(cardPaper('card-1')?.className).toMatch(/cardActive/);
        expect(cardPaper('card-2')?.className).not.toMatch(/cardActive/);

        fireEvent.click(screen.getAllByRole('button', { name: 'View' })[1]);

        expect(cardPaper('card-1')?.className).not.toMatch(/cardActive/);
        expect(cardPaper('card-2')?.className).toMatch(/cardActive/);
    });

    it('does not open the preview for a build that finished before this session', async () => {
        mockedLightdashApi.mockResolvedValue(
            app([version({ status: 'ready' })]),
        );
        renderCard({
            status: 'success',
            appUuid: APP_UUID,
            version: 1,
            name: 'Revenue app',
            href: '/projects/project-1/apps/app-1',
        });

        expect(await screen.findByText('Revenue app')).toBeVisible();
        await waitFor(() =>
            expect(mockedLightdashApi).toHaveBeenCalledTimes(1),
        );
        expect(WorkerStub.last).toBeNull();
        expect(store.getState().aiArtifact.preview).toBeNull();
    });

    it('shows a cancelled build from the recorded result', () => {
        mockedLightdashApi.mockResolvedValue(
            app([version({ status: 'error' })]),
        );
        renderCard({
            status: 'error',
            appUuid: APP_UUID,
            reason: 'cancelled',
            message: 'The build was cancelled.',
        });

        expect(screen.getByText('Build cancelled')).toBeVisible();
        expect(WorkerStub.last).toBeNull();
    });

    it('renders unavailable when the app is gone', async () => {
        mockedLightdashApi.mockRejectedValue({
            status: 'error',
            error: { statusCode: 404, name: 'NotFoundError', message: '' },
        });
        renderCard(pending);

        expect(
            await screen.findByText('This app is no longer available.'),
        ).toBeVisible();
    });

    it('renders nothing when the build never started', () => {
        renderCard({
            status: 'error',
            appUuid: null,
            reason: 'failed',
            message: 'Data apps are not enabled',
        });

        expect(screen.getByTestId('host')).toBeEmptyDOMElement();
    });
});
