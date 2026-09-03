import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueryEvent } from '../../../../../features/apps/hooks/useAppSdkBridge';
import { renderWithProviders } from '../../../../../testing/testUtils';

type IframePreviewProps = {
    onQueryEvent?: (event: QueryEvent) => void;
};

const mocks = vi.hoisted(() => ({
    iframePreview: vi.fn((_props: IframePreviewProps) => null),
    latestReadyVersion: 3,
    tokenLoading: false,
}));

vi.mock('../../../../../features/apps/AppIframePreview', () => ({
    default: mocks.iframePreview,
}));

vi.mock('../../../../../features/apps/hooks/useAppPreviewToken', () => ({
    useAppPreviewToken: () => ({
        data: mocks.tokenLoading ? undefined : 'preview-token',
        isLoading: mocks.tokenLoading,
        error: undefined,
    }),
}));

vi.mock('../../../../../features/apps/hooks/useGetApp', () => ({
    useGetApp: () => ({
        data: {
            pages: [
                {
                    name: 'Sales app',
                    description: null,
                    latestReadyVersion: mocks.latestReadyVersion,
                    versions: [{ status: 'ready' }],
                },
            ],
        },
        isLoading: false,
        error: undefined,
    }),
}));

vi.mock('../../../../../features/apps/previewOrigin', () => ({
    usePreviewOrigin: () => 'https://preview.example.com',
}));

vi.mock('../../store/hooks', () => ({
    useAiAgentStoreDispatch: () => vi.fn(),
}));

// eslint-disable-next-line import/first
import { AiDataAppPreviewPanel } from './AiDataAppPreviewPanel';

const dataAppPreview = {
    appUuid: 'app-uuid',
    messageUuid: 'message-uuid',
    threadUuid: 'thread-uuid',
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
    version: null,
    latestReadyVersionAtOpen: null,
};

const latestIframeProps = (): IframePreviewProps => {
    const { calls } = mocks.iframePreview.mock;
    return calls[calls.length - 1][0];
};

const readyQuery = (id: string): QueryEvent => ({
    id,
    timestamp: 0,
    label: 'Revenue',
    exploreName: 'orders',
    dimensions: [],
    metrics: [],
    filters: {},
    sorts: [],
    tableCalculations: [],
    additionalMetrics: [],
    limit: 0,
    queryUuid: `${id}-uuid`,
    status: 'ready',
    rowCount: 1,
    durationMs: 10,
    error: null,
    rawMetricQuery: null,
});

const panel = (showInspector: boolean) => (
    <AiDataAppPreviewPanel
        dataAppPreview={dataAppPreview}
        showInspector={showInspector}
    />
);

// A new ready version refetches the preview token, so the iframe briefly
// gives way to a loader before the new bundle mounts.
const landNewVersion = (
    rerender: (ui: React.ReactElement) => void,
    version: number,
) => {
    mocks.latestReadyVersion = version;
    mocks.tokenLoading = true;
    rerender(panel(true));
    mocks.tokenLoading = false;
    rerender(panel(true));
};

describe('AiDataAppPreviewPanel inspector', () => {
    beforeEach(() => {
        mocks.latestReadyVersion = 3;
        mocks.tokenLoading = false;
        window.localStorage.clear();
    });

    it('surfaces the query inspector once the app issues a query', () => {
        renderWithProviders(panel(true));
        expect(screen.queryByText(/Queries \(/)).not.toBeInTheDocument();

        act(() => latestIframeProps().onQueryEvent?.(readyQuery('r1')));

        expect(screen.getByText('Queries (1)')).toBeInTheDocument();
    });

    it('clears the log when a new version lands', () => {
        const { rerender } = renderWithProviders(panel(true));
        act(() => latestIframeProps().onQueryEvent?.(readyQuery('r1')));
        expect(screen.getByText('Queries (1)')).toBeInTheDocument();

        landNewVersion(rerender, 4);

        expect(screen.queryByText(/Queries \(/)).not.toBeInTheDocument();
        act(() => latestIframeProps().onQueryEvent?.(readyQuery('r2')));
        expect(screen.getByText('Queries (1)')).toBeInTheDocument();
    });

    it('keeps the log across versions when Persist is on', () => {
        window.localStorage.setItem('data-apps:persist-logs', 'true');
        const { rerender } = renderWithProviders(panel(true));
        act(() => latestIframeProps().onQueryEvent?.(readyQuery('r1')));

        landNewVersion(rerender, 4);
        act(() => latestIframeProps().onQueryEvent?.(readyQuery('r2')));

        expect(screen.getByText('Queries (2)')).toBeInTheDocument();
    });

    it('re-opens a dismissed inspector from the menu', async () => {
        const user = userEvent.setup();
        renderWithProviders(panel(true));
        act(() => latestIframeProps().onQueryEvent?.(readyQuery('r1')));
        expect(screen.getByText('Queries (1)')).toBeInTheDocument();

        await user.click(screen.getByLabelText('Close inspector panel'));
        expect(screen.queryByText('Queries (1)')).not.toBeInTheDocument();

        await user.click(screen.getByLabelText('More options'));
        await user.click(await screen.findByText('Show network'));
        expect(screen.getByText('Queries (1)')).toBeInTheDocument();

        await user.click(screen.getByLabelText('More options'));
        expect(await screen.findByText('Hide network')).toBeInTheDocument();
    });

    it('shows the inspector from the menu before the first query', async () => {
        const user = userEvent.setup();
        renderWithProviders(panel(true));
        expect(screen.queryByText(/Queries \(/)).not.toBeInTheDocument();

        await user.click(screen.getByLabelText('More options'));
        await user.click(await screen.findByText('Show network'));
        expect(screen.getByText('Queries (0)')).toBeInTheDocument();
    });

    it('leaves the launcher preview without inspector wiring', () => {
        renderWithProviders(panel(false));
        expect(latestIframeProps().onQueryEvent).toBeUndefined();
    });
});
