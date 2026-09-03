import { act, fireEvent, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElementSelectedEvent } from '../../../../../features/apps/hooks/useAppSdkBridge';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { store } from '../../store';
import {
    clearThreadElementReferences,
    selectThreadElementReferences,
} from '../../store/aiAgentThreadElementRefsSlice';

type IframePreviewProps = {
    inspectorEnabled?: boolean;
    onElementSelected?: (event: ElementSelectedEvent) => void;
    onInspectorAvailabilityChange?: (available: boolean) => void;
    onInspectorCancelled?: () => void;
};

const mocks = vi.hoisted(() => ({
    iframePreview: vi.fn((_props: IframePreviewProps) => null),
    latestReadyVersion: 3,
}));

vi.mock('../../../../../features/apps/AppIframePreview', () => ({
    default: mocks.iframePreview,
}));

vi.mock('../../../../../features/apps/hooks/useAppPreviewToken', () => ({
    useAppPreviewToken: () => ({
        data: 'preview-token',
        isLoading: false,
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

vi.mock('../../hooks/useDeepResearch', () => ({
    useHasActiveDeepResearchRun: vi.fn(() => false),
}));

vi.mock('../../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(() => ({ data: { enabled: false } })),
}));

// eslint-disable-next-line import/first
import { AgentChatInput } from './AgentChatInput';
// eslint-disable-next-line import/first
import { AiDataAppPreviewPanel } from './AiDataAppPreviewPanel';

const THREAD_UUID = 'thread-uuid';

const dataAppPreview = {
    appUuid: 'app-uuid',
    messageUuid: 'message-uuid',
    threadUuid: THREAD_UUID,
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
    version: null,
    latestReadyVersionAtOpen: null,
};

const latestIframeProps = (): IframePreviewProps => {
    const { calls } = mocks.iframePreview.mock;
    return calls[calls.length - 1][0];
};

const announcePicker = () =>
    act(() => latestIframeProps().onInspectorAvailabilityChange?.(true));

const pickElement = (label: string) =>
    act(() => latestIframeProps().onElementSelected?.({ label }));

const pickerToggle = () => screen.queryByLabelText('Toggle element picker');

const HEADING_LABEL = '[h1 "Revenue" @src/App.jsx:14]';
const HEADING_PILL = '<h1> Revenue';

/** Panel and composer side by side, as the full-page thread layout has them. */
const renderThread = (showInspector: boolean) => {
    const onSubmit = vi.fn();
    const view = renderWithProviders(
        <Provider store={store}>
            <MemoryRouter>
                <AiDataAppPreviewPanel
                    dataAppPreview={dataAppPreview}
                    showInspector={showInspector}
                />
                <AgentChatInput
                    onSubmit={onSubmit}
                    projectUuid="project-uuid"
                    agentUuid="agent-uuid"
                    threadUuid={THREAD_UUID}
                    defaultValue="make it bigger"
                    showSuggestions={false}
                />
            </MemoryRouter>
        </Provider>,
    );
    return { ...view, onSubmit };
};

describe('AiDataAppPreviewPanel element picker', () => {
    beforeEach(() => {
        mocks.latestReadyVersion = 3;
        window.localStorage.clear();
        store.dispatch(
            clearThreadElementReferences({ threadUuid: THREAD_UUID }),
        );
    });

    it('shows the toggle only once the app announces the picker', () => {
        renderThread(true);
        expect(pickerToggle()).not.toBeInTheDocument();

        announcePicker();

        expect(pickerToggle()).toBeInTheDocument();
    });

    it('never shows the toggle in the launcher preview', () => {
        renderThread(false);
        expect(
            latestIframeProps().onInspectorAvailabilityChange,
        ).toBeUndefined();
        expect(pickerToggle()).not.toBeInTheDocument();
    });

    it('adds picked elements to the composer as element references, collapsing duplicates', () => {
        renderThread(true);
        announcePicker();
        fireEvent.click(pickerToggle()!);
        expect(latestIframeProps().inspectorEnabled).toBe(true);

        pickElement(HEADING_LABEL);
        pickElement(HEADING_LABEL);
        pickElement('[button "Export"]');

        expect(screen.getAllByText(HEADING_PILL)).toHaveLength(1);
        expect(screen.getByText('<button> Export')).toBeInTheDocument();
        // Stays on across clicks.
        expect(latestIframeProps().inspectorEnabled).toBe(true);
    });

    it('removes an element reference from the composer', () => {
        renderThread(true);
        announcePicker();
        fireEvent.click(pickerToggle()!);
        pickElement(HEADING_LABEL);

        fireEvent.click(screen.getByLabelText(`Remove ${HEADING_PILL}`));

        expect(screen.queryByText(HEADING_PILL)).not.toBeInTheDocument();
    });

    it('keeps element references when the panel closes and a new version lands', () => {
        const { rerender } = renderThread(true);
        announcePicker();
        fireEvent.click(pickerToggle()!);
        pickElement(HEADING_LABEL);

        mocks.latestReadyVersion = 4;
        rerender(
            <Provider store={store}>
                <MemoryRouter>
                    <AgentChatInput
                        onSubmit={vi.fn()}
                        projectUuid="project-uuid"
                        agentUuid="agent-uuid"
                        threadUuid={THREAD_UUID}
                        showSuggestions={false}
                    />
                </MemoryRouter>
            </Provider>,
        );

        expect(screen.getByText(HEADING_PILL)).toBeInTheDocument();
        expect(
            selectThreadElementReferences(THREAD_UUID)(store.getState()),
        ).toEqual([
            {
                appUuid: 'app-uuid',
                appSlug: 'sales-app',
                appDisplayName: 'Sales app',
                version: 3,
                tag: 'h1',
                text: 'Revenue',
                loc: 'src/App.jsx:14',
            },
        ]);
    });

    it('sends the element references as context and clears them', () => {
        const { onSubmit } = renderThread(true);
        announcePicker();
        fireEvent.click(pickerToggle()!);
        pickElement(HEADING_LABEL);

        fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });

        expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'make it bigger',
                context: [
                    {
                        type: 'data_app_element',
                        appUuid: 'app-uuid',
                        version: 3,
                        tag: 'h1',
                        text: 'Revenue',
                        loc: 'src/App.jsx:14',
                    },
                ],
                optimisticContext: [
                    expect.objectContaining({
                        type: 'data_app_element',
                        appSlug: 'sales-app',
                        displayName: 'Sales app',
                    }),
                ],
            }),
        );
        expect(screen.queryByText(HEADING_PILL)).not.toBeInTheDocument();
    });

    it('leaves the picker on Esc and keeps the element references', () => {
        renderThread(true);
        announcePicker();
        fireEvent.click(pickerToggle()!);
        pickElement(HEADING_LABEL);

        act(() => latestIframeProps().onInspectorCancelled?.());

        expect(latestIframeProps().inspectorEnabled).toBe(false);
        expect(screen.getByText(HEADING_PILL)).toBeInTheDocument();
    });
});
