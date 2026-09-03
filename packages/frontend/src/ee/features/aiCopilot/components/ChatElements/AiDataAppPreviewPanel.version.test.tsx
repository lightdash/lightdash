import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import {
    setDataAppPreviewVersion,
    type DataAppPreviewData,
} from '../../store/aiArtifactSlice';

type IframePreviewProps = {
    src: string;
    onInspectorAvailabilityChange?: (available: boolean) => void;
};

const mocks = vi.hoisted(() => ({
    iframePreview: vi.fn((_props: IframePreviewProps) => null),
    latestReadyVersion: 3,
    tokenLoading: false,
    dispatch: vi.fn(),
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
                    appUuid: 'app-uuid',
                    name: 'Sales app',
                    slug: 'sales-app',
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
    useAiAgentStoreDispatch: () => mocks.dispatch,
}));

// eslint-disable-next-line import/first
import { AiDataAppPreviewPanel } from './AiDataAppPreviewPanel';

const preview = (
    version: Pick<DataAppPreviewData, 'version' | 'latestReadyVersionAtOpen'>,
): DataAppPreviewData => ({
    appUuid: 'app-uuid',
    messageUuid: 'message-uuid',
    threadUuid: 'thread-uuid',
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
    ...version,
});

const latest = preview({ version: null, latestReadyVersionAtOpen: null });
const olderVersion = preview({ version: 1, latestReadyVersionAtOpen: 3 });

const panel = (dataAppPreview: DataAppPreviewData) => (
    <AiDataAppPreviewPanel dataAppPreview={dataAppPreview} showInspector />
);

const latestIframeProps = (): IframePreviewProps => {
    const { calls } = mocks.iframePreview.mock;
    return calls[calls.length - 1][0];
};

const iframeVersion = () =>
    latestIframeProps().src.match(/\/versions\/(\d+)\//)?.[1];

const announcePicker = () =>
    act(() => latestIframeProps().onInspectorAvailabilityChange?.(true));

const pickerToggle = () => screen.queryByLabelText('Toggle element picker');

const pill = () => screen.queryByText(/Viewing v/);

const openInNewTabHref = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByLabelText('More options'));
    const item = await screen.findByRole('menuitem', {
        name: 'Open in new tab',
    });
    return item.getAttribute('href');
};

// A new ready version refetches the preview token, so the iframe briefly
// gives way to a loader before the new bundle mounts.
const landNewVersion = (
    rerender: (ui: React.ReactElement) => void,
    dataAppPreview: DataAppPreviewData,
    version: number,
) => {
    mocks.latestReadyVersion = version;
    mocks.tokenLoading = true;
    rerender(panel(dataAppPreview));
    mocks.tokenLoading = false;
    rerender(panel(dataAppPreview));
};

describe('AiDataAppPreviewPanel versions', () => {
    beforeEach(() => {
        mocks.latestReadyVersion = 3;
        mocks.tokenLoading = false;
        mocks.dispatch.mockReset();
        window.localStorage.clear();
    });

    it('shows the latest ready version with the picker and no pill', async () => {
        const user = userEvent.setup();
        renderWithProviders(panel(latest));
        announcePicker();

        expect(iframeVersion()).toBe('3');
        expect(pill()).not.toBeInTheDocument();
        expect(pickerToggle()).toBeInTheDocument();
        expect(await openInNewTabHref(user)).toBe(
            '/projects/project-uuid/apps/app-uuid/view',
        );
    });

    it('shows the pill and hides the picker on an older version', async () => {
        const user = userEvent.setup();
        renderWithProviders(panel(olderVersion));
        announcePicker();

        expect(iframeVersion()).toBe('1');
        expect(screen.getByText('Viewing v1')).toBeInTheDocument();
        expect(pickerToggle()).not.toBeInTheDocument();
        expect(await openInNewTabHref(user)).toBe(
            '/projects/project-uuid/apps/app-uuid/versions/1/view',
        );
    });

    it('returns to the latest ready version from the pill', async () => {
        const user = userEvent.setup();
        renderWithProviders(panel(olderVersion));

        await user.click(
            screen.getByRole('button', { name: 'Return to latest' }),
        );

        expect(mocks.dispatch).toHaveBeenCalledWith(
            setDataAppPreviewVersion({
                version: null,
                latestReadyVersionAtOpen: 3,
            }),
        );
    });

    it('jumps to latest when a newer ready version lands', () => {
        const { rerender } = renderWithProviders(panel(olderVersion));
        expect(iframeVersion()).toBe('1');

        landNewVersion(rerender, olderVersion, 4);

        expect(iframeVersion()).toBe('4');
        expect(pill()).not.toBeInTheDocument();
    });

    it('shows no pill for a card whose version is the latest', () => {
        renderWithProviders(
            panel(preview({ version: 3, latestReadyVersionAtOpen: 3 })),
        );

        expect(iframeVersion()).toBe('3');
        expect(pill()).not.toBeInTheDocument();
    });
});
