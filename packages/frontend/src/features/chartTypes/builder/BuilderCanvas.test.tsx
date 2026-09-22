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

    it('leaves the preview free of a sample-data header', () => {
        renderCanvas();

        expect(screen.queryByText('Sample data')).not.toBeInTheDocument();
        expect(screen.queryByText('Made-up rows.')).not.toBeInTheDocument();
    });

    it('renders the preview without a configure panel', () => {
        renderCanvas({ configurePanel: null });

        expect(screen.queryByText('Sample data')).not.toBeInTheDocument();
    });
});
