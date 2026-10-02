import { fireEvent, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { clearPreview } from '../../store/aiArtifactSlice';
import { AiDocumentPreviewPanel } from './AiDocumentPreviewPanel';

const mocks = vi.hoisted(() => ({
    dispatch: vi.fn(),
    useDocument: vi.fn(),
}));
vi.mock('../../store/hooks', () => ({
    useAiAgentStoreDispatch: () => mocks.dispatch,
}));
vi.mock('../../../../../features/documents/useDocument', () => ({
    useDocument: mocks.useDocument,
}));
vi.mock('../../../../../features/documents/DocumentRenderer', () => ({
    default: ({
        document,
        showContents,
        actions,
    }: {
        document: { name: string };
        showContents: boolean;
        actions: ReactNode;
    }) => (
        <div data-testid="renderer" data-show-contents={String(showContents)}>
            {document.name}
            {actions}
        </div>
    ),
}));

const preview = {
    documentUuidOrSlug: 'weekly-review',
    messageUuid: 'message-uuid',
    threadUuid: 'thread-uuid',
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
};

const renderPanel = () =>
    renderWithProviders(
        <MemoryRouter>
            <AiDocumentPreviewPanel documentPreview={preview} />
        </MemoryRouter>,
    );

describe('AiDocumentPreviewPanel', () => {
    beforeEach(() => {
        mocks.dispatch.mockReset();
        mocks.useDocument.mockReset();
    });

    it('loads the Document the preview points at', () => {
        mocks.useDocument.mockReturnValue({
            data: undefined,
            isInitialLoading: true,
            isError: false,
        });
        renderPanel();
        expect(mocks.useDocument).toHaveBeenCalledWith(
            'project-uuid',
            'weekly-review',
        );
        expect(screen.queryByTestId('renderer')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Close' })).toBeVisible();
    });

    it('explains a failed load and can still be closed', () => {
        mocks.useDocument.mockReturnValue({
            data: undefined,
            isInitialLoading: false,
            isError: true,
        });
        renderPanel();
        expect(
            screen.getByText('Failed to load document. Please try again.'),
        ).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(mocks.dispatch).toHaveBeenCalledWith(clearPreview());
    });

    it('renders the Document without its contents rail and links to the full page', () => {
        mocks.useDocument.mockReturnValue({
            data: {
                name: 'Weekly review',
                projectUuid: 'project-uuid',
                documentUuid: '36d4516a-3af0-48f6-9b47-d50956301501',
                slug: 'weekly-review',
            },
            isInitialLoading: false,
            isError: false,
        });
        renderPanel();
        expect(screen.getByTestId('renderer')).toHaveAttribute(
            'data-show-contents',
            'false',
        );
        expect(
            screen.getByRole('link', { name: 'Open Document' }),
        ).toHaveAttribute(
            'href',
            '/projects/project-uuid/documents/weekly-review',
        );
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(mocks.dispatch).toHaveBeenCalledWith(clearPreview());
    });
});
