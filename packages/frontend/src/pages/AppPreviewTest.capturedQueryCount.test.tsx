import { act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { QueryEvent } from '../features/apps/hooks/useAppSdkBridge';
import { renderWithProviders } from '../testing/testUtils';

type IframePreviewProps = {
    onQueryEvent?: (event: QueryEvent) => void;
};

type HeaderActionsProps = {
    capturedQueryCount?: number;
};

const mocks = vi.hoisted(() => ({
    iframePreview: vi.fn((_props: IframePreviewProps) => null),
    headerActions: vi.fn((_props: HeaderActionsProps) => null),
    versionParam: '1' as string | undefined,
}));

vi.mock('react-router', () => ({
    Navigate: () => null,
    useNavigate: () => vi.fn(),
    useParams: () => ({
        projectUuid: 'project-uuid',
        appUuid: 'app-uuid',
        version: mocks.versionParam,
    }),
}));

vi.mock('../features/apps/AppIframePreview', () => ({
    default: mocks.iframePreview,
}));

vi.mock('../features/apps/components/AppHeaderActions', () => ({
    default: mocks.headerActions,
}));

vi.mock('../features/apps/hooks/useAppPreviewToken', () => ({
    useAppPreviewToken: () => ({
        data: 'preview-token',
        isLoading: false,
        error: undefined,
    }),
}));

vi.mock('../features/apps/hooks/useGetApp', () => ({
    useGetApp: () => ({
        data: {
            pages: [
                {
                    name: 'Sales app',
                    description: null,
                    spaceUuid: null,
                    spaceName: null,
                    createdByUserUuid: 'user-uuid',
                    latestReadyVersion: 5,
                    versions: [{ status: 'ready' }],
                },
            ],
        },
        isLoading: false,
        error: undefined,
    }),
}));

vi.mock('../features/apps/hooks/useCanEditDataApp', () => ({
    useCanEditDataApp: () => false,
}));

vi.mock('../features/apps/hooks/useAppBuildPoller', () => ({
    useAppBuildPoller: () => {},
}));

vi.mock('../features/apps/previewOrigin', () => ({
    usePreviewOrigin: () => 'https://preview.example.com',
}));

vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        isLoading: false,
        data: { enabled: true },
    }),
}));

// eslint-disable-next-line import/first
import AppPreviewTest from './AppPreviewTest';

const latestIframeProps = (): IframePreviewProps => {
    const { calls } = mocks.iframePreview.mock;
    return calls[calls.length - 1][0];
};

const latestHeaderActionsProps = (): HeaderActionsProps => {
    const { calls } = mocks.headerActions.mock;
    return calls[calls.length - 1][0];
};

const readyEvent = (id: string): QueryEvent => ({
    id,
    timestamp: Date.now(),
    label: null,
    exploreName: '',
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

describe('AppPreviewTest capturedQueryCount', () => {
    it('resets the captured query count when the previewed version changes', () => {
        mocks.versionParam = '1';
        const { rerender } = renderWithProviders(<AppPreviewTest />);

        act(() => {
            latestIframeProps().onQueryEvent?.(readyEvent('q1'));
        });
        expect(latestHeaderActionsProps().capturedQueryCount).toBe(1);

        // Same route re-render with an unchanged version must NOT reset —
        // only the version identity is the reset signal.
        rerender(<AppPreviewTest />);
        expect(latestHeaderActionsProps().capturedQueryCount).toBe(1);

        // Navigating to a different version re-renders this component (no
        // remount) — the previous version's ready query must not survive.
        mocks.versionParam = '2';
        rerender(<AppPreviewTest />);

        expect(latestHeaderActionsProps().capturedQueryCount).toBe(0);
    });
});
