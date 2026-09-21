import { screen } from '@testing-library/react';
import { type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import BuilderCanvas from './BuilderCanvas';

vi.mock('../../apps/components/AppPreview', () => ({
    default: () => <div>Preview iframe</div>,
}));

const renderCanvas = (
    props: Partial<ComponentProps<typeof BuilderCanvas>> = {},
) =>
    renderWithProviders(
        <BuilderCanvas
            projectUuid="project-1"
            appUuid="app-1"
            previewVersion={1}
            isBuilding={false}
            failureMessage={null}
            isClarifyRoundOpen={false}
            clarifierUnavailable={false}
            previewContext={null}
            previewDataSource={null}
            previewSourceExtra={null}
            previewOverlay={null}
            configurePanel={<div>Options panel</div>}
            onPickExample={null}
            onSdkManifest={vi.fn()}
            syncPreviewUrlState={false}
            elementPickerProps={{
                inspectorEnabled: false,
                onElementSelected: vi.fn(),
                onInspectorAvailabilityChange: vi.fn(),
                onInspectorCancelled: vi.fn(),
            }}
            previewRef={{ current: null }}
            onScreenshotAvailabilityChange={vi.fn()}
            {...props}
        />,
    );

describe('BuilderCanvas', () => {
    it('renders the preview before the configure panel in the DOM', () => {
        renderCanvas();

        const preview = screen.getByText('Preview iframe');
        const panel = screen.getByText('Options panel');
        expect(preview.compareDocumentPosition(panel)).toBe(
            Node.DOCUMENT_POSITION_FOLLOWING,
        );
    });

    it('shows the sample data badge when the preview is fabricated', () => {
        renderCanvas({ previewDataSource: { kind: 'sample' } });

        expect(screen.getByText('Sample data')).toBeInTheDocument();
        expect(screen.getByText('Made-up rows.')).toBeInTheDocument();
    });

    it('shows no sample data badge without a preview data source', () => {
        renderCanvas({ previewDataSource: null });

        expect(screen.queryByText('Sample data')).not.toBeInTheDocument();
    });

    it('names the explore, row count and age of a live run', () => {
        renderCanvas({
            previewDataSource: {
                kind: 'live',
                exploreLabel: 'Customers',
                rowCount: 12,
                ranAt: new Date(Date.now() - 2 * 60 * 1000),
            },
        });

        expect(screen.getByText('Live data')).toBeInTheDocument();
        expect(
            screen.getByText(
                'Customers, 12 rows from 2 minutes ago. Not re-run until you refresh.',
            ),
        ).toBeInTheDocument();
    });

    it('keeps the chart mounted and receded under an overlay', () => {
        renderCanvas({
            previewDataSource: { kind: 'mismatch', issueCount: 1 },
            previewOverlay: <div>Does not fit</div>,
        });

        expect(screen.getByText('Does not fit')).toBeInTheDocument();
        // Unmounting would reload the sandbox and stale its capture handle.
        expect(screen.getByText('Preview iframe')).toBeInTheDocument();
        expect(screen.getByText('1 input to fix')).toBeInTheDocument();
    });

    it('states an unreadable explore instead of claiming a source', () => {
        renderCanvas({
            previewDataSource: {
                kind: 'unavailable',
                message: 'You do not have access to this explore.',
            },
        });

        expect(screen.queryByText('Sample data')).not.toBeInTheDocument();
        expect(
            screen.getByText('You do not have access to this explore.'),
        ).toBeInTheDocument();
    });
});
