import {
    DOCUMENT_EXPORT_CLASS,
    SCREENSHOT_FAILED_STATUS,
    SCREENSHOT_READY_INDICATOR_ID,
    type Document,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { act, render } from '@testing-library/react';
import {
    useDocumentExportStatus,
    type DocumentExportStatus,
} from '../features/documents/documentExportStatus';
import MinimalDocument from './MinimalDocument';

const mocks = vi.hoisted(() => ({
    versionUuid: 'version' as string | null,
    query: {} as { data?: unknown; isError?: boolean },
    useDocumentVersion: vi.fn(),
    exportStatus: null as DocumentExportStatus | null,
}));
vi.mock('react-router', () => ({
    useParams: () => ({ documentUuid: 'document' }),
    useSearchParams: () => [
        new URLSearchParams(
            mocks.versionUuid ? { versionUuid: mocks.versionUuid } : {},
        ),
    ],
}));
vi.mock('../hooks/useProjectUuid', () => ({ useProjectUuid: () => 'project' }));
vi.mock('../features/documents/useDocumentVersions', () => ({
    useDocumentVersion: (...args: unknown[]) => {
        mocks.useDocumentVersion(...args);
        return mocks.query;
    },
}));
vi.mock('../features/documents/editor/useDocumentEditor', () => ({
    useDocumentReader: () => ({ editor: {}, headings: [] }),
}));
vi.mock('../features/documents/DocumentByline', () => ({
    default: () => null,
}));
// Stands in for the chart node views, which report through the context
const ChartCells = () => {
    mocks.exportStatus = useDocumentExportStatus();
    return null;
};
vi.mock('@tiptap/react', () => ({ EditorContent: () => <ChartCells /> }));

const document = {
    projectUuid: 'project',
    spaceUuid: 'space',
    documentUuid: 'document',
    name: 'Weekly report',
    version: {
        versionUuid: 'version',
        content: {
            cells: [
                { type: 'markdown', content: { markdown: '# Findings' } },
                { type: 'chart', content: {} },
                { type: 'chart', content: {} },
            ],
        },
    },
} as unknown as Document;

const getIndicator = () =>
    window.document.getElementById(SCREENSHOT_READY_INDICATOR_ID);

const renderPage = () =>
    render(
        <MantineProvider>
            <MinimalDocument />
        </MantineProvider>,
    );

describe('MinimalDocument', () => {
    beforeEach(() => {
        mocks.versionUuid = 'version';
        mocks.query = { data: document };
        mocks.useDocumentVersion.mockReset();
        mocks.exportStatus = null;
    });

    it('loads exactly the requested version', () => {
        renderPage();
        expect(mocks.useDocumentVersion).toHaveBeenCalledWith(
            'project',
            'document',
            'version',
        );
    });

    it('signals ready only once every chart has drawn or failed', () => {
        renderPage();
        expect(getIndicator()).toBeNull();
        act(() => mocks.exportStatus?.markReady(1));
        expect(getIndicator()).toBeNull();
        act(() => mocks.exportStatus?.markErrored(2));
        expect(getIndicator()).toHaveAttribute(
            'data-status',
            'completed-with-errors',
        );
        expect(getIndicator()).toHaveAttribute('data-tiles-total', '2');
        expect(getIndicator()).toHaveAttribute('data-tiles-ready', '1');
        expect(getIndicator()).toHaveAttribute('data-tiles-errored', '1');
    });

    it('keeps a chart failed when it later reports ready', () => {
        renderPage();
        act(() => {
            mocks.exportStatus?.markErrored(1);
            mocks.exportStatus?.markReady(1);
            mocks.exportStatus?.markReady(2);
        });
        expect(getIndicator()).toHaveAttribute('data-tiles-errored', '1');
    });

    it.each([
        {
            name: 'cannot be loaded',
            query: { isError: true },
            versionUuid: 'version',
        },
        { name: 'has no version', query: {}, versionUuid: null },
    ])(
        'signals failure when the Document $name, printing nothing',
        ({ query, versionUuid }) => {
            mocks.query = query;
            mocks.versionUuid = versionUuid;
            renderPage();
            expect(getIndicator()).toHaveAttribute(
                'data-status',
                SCREENSHOT_FAILED_STATUS,
            );
            expect(getIndicator()?.parentElement).toHaveClass(
                DOCUMENT_EXPORT_CLASS,
            );
            expect(
                window.document.body.textContent?.includes('Weekly report'),
            ).toBe(false);
        },
    );
});
