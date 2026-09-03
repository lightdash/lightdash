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
import { AiDataAppBuildCard } from './AiDataAppBuildCard';

vi.mock('../../../../../../api', () => ({ lightdashApi: vi.fn() }));
const mockedLightdashApi = vi.mocked(lightdashApi);

// The builder's poller runs in a Web Worker; jsdom has none. The stub keeps
// the last instance so a test can hand it a poll result.
class WorkerStub {
    static last: WorkerStub | null = null;

    onmessage: ((event: MessageEvent) => void) | null = null;

    constructor() {
        WorkerStub.last = this;
    }

    postMessage() {}

    terminate() {}
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
    versions,
    hasMore: false,
    latestReadyVersion:
        versions.find((v) => v.status === 'ready')?.version ?? null,
});

const pending: ToolGenerateDataAppOutput['metadata'] = {
    status: 'pending',
    appUuid: APP_UUID,
    version: 1,
};

const renderCard = (
    metadata: ToolGenerateDataAppOutput['metadata'],
    compact = false,
) =>
    renderWithProviders(
        <Provider store={store}>
            <MemoryRouter>
                <div data-testid="host">
                    <AiDataAppBuildCard
                        metadata={metadata}
                        compact={compact}
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
        WorkerStub.last = null;
        mockedLightdashApi.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('follows a pending build from building to ready and opens the preview once', async () => {
        mockedLightdashApi.mockResolvedValue(
            app([
                version({
                    status: 'generating',
                    statusMessage: 'Generating your app',
                }),
            ]),
        );
        renderCard(pending);

        expect(await screen.findByText('Generating your app')).toBeVisible();
        expect(store.getState().aiArtifact.preview).toBeNull();

        pollResult([
            version({
                status: 'ready',
                statusMessage: 'Your revenue app is ready.',
                statusUpdatedAt: new Date('2026-08-28T10:06:12.000Z'),
            }),
        ]);

        expect(await screen.findByText('Revenue app')).toBeVisible();
        expect(screen.getByText('v1 · built in 6m 12s')).toBeVisible();
        expect(store.getState().aiArtifact.preview).toEqual(expectedPreview);

        // Closing the panel is final for this build; View brings it back.
        act(() => {
            store.dispatch(clearPreview());
        });
        pollResult([version({ status: 'ready' })]);
        expect(store.getState().aiArtifact.preview).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'View' }));
        expect(store.getState().aiArtifact.preview).toEqual(expectedPreview);
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
                            compact={false}
                            {...IDS}
                        />
                    </div>
                    <div data-testid="card-2">
                        <AiDataAppBuildCard
                            metadata={success(2)}
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
