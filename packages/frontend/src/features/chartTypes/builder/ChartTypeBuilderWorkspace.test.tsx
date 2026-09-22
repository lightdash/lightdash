import { type DataAppVizSchema } from '@lightdash/common';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { appVersion } from '../../apps/testing/appVersionHistory';
import { buildStub } from '../testing/dataAppVizBuildStub';
import BuilderPromptBar from './BuilderPromptBar';
import ChartTypeBuilderWorkspace from './ChartTypeBuilderWorkspace';
import { type ChartTypeBuilderWorkspaceState } from './useChartTypeBuilderWorkspace';

vi.mock('./BuilderCanvas', () => ({
    default: () => <div>Chart preview</div>,
}));
vi.mock('./BuilderPromptBar', () => ({ default: vi.fn(() => null) }));
vi.mock('./VersionHistoryPanel', () => ({
    default: ({ onClose }: { onClose: () => void }) => (
        <aside aria-label="Version history">
            <button onClick={onClose}>Collapse version history</button>
        </aside>
    ),
}));

const workspace = (isHistoryOpen: boolean) =>
    ({
        dataAppVizUuid: 'chart-type-1',
        hasHistory: true,
        isHistoryOpen,
        isPromptBarMounted: false,
        clarification: { fellThrough: false },
        history: { versions: [] },
    }) as unknown as ChartTypeBuilderWorkspaceState;

const view = (isHistoryOpen: boolean) => (
    <ChartTypeBuilderWorkspace
        projectUuid="project-1"
        workspace={workspace(isHistoryOpen)}
        previewContext={null}
        syncPreviewUrlState={false}
        configurePanel={null}
        configurationSidebar={
            <input aria-label="Chart setting" defaultValue="original" />
        }
    />
);

describe('ChartTypeBuilderWorkspace layout', () => {
    it('supplies the latest ready schema to standalone builds when an older preview is pinned', () => {
        const schema: DataAppVizSchema = {
            fields: [],
            configOptions: [],
            colorPalette: null,
        };
        renderWithProviders(
            <ChartTypeBuilderWorkspace
                projectUuid="project-1"
                workspace={{
                    ...workspace(false),
                    isPromptBarMounted: true,
                    build: buildStub(),
                    viewedVersion: 1,
                    history: {
                        ...workspace(false).history,
                        latestReadyVersion: 2,
                        versions: [
                            appVersion({
                                version: 2,
                                resources: {
                                    images: [],
                                    files: [],
                                    charts: [],
                                    dashboardName: null,
                                    clarifications: [],
                                    vizSchema: schema,
                                },
                            }),
                        ],
                    },
                }}
                previewContext={null}
                syncPreviewUrlState={false}
                configurePanel={null}
            />,
        );
        expect(
            vi.mocked(BuilderPromptBar).mock.lastCall?.[0].buildContext,
        ).toEqual({ schema });
    });

    it('keeps the history pane available for its exit transition but inactive', () => {
        const { rerender } = renderWithProviders(view(true));
        const pane = document.getElementById('chart-type-builder-history');
        rerender(view(false));
        expect(document.getElementById('chart-type-builder-history')).toBe(
            pane,
        );
        expect(pane).toHaveAttribute('inert');
        expect(pane).toHaveAttribute('aria-hidden', 'true');
        expect(screen.queryByRole('separator')).not.toBeInTheDocument();
    });

    it('keeps chart configuration with the preview before the history pane', () => {
        renderWithProviders(view(true));
        const canvas = document.getElementById('chart-type-builder-canvas')!;
        expect(within(canvas).getByText('Chart preview')).toBeInTheDocument();
        expect(
            within(canvas).getByRole('textbox', { name: 'Chart setting' }),
        ).toBeInTheDocument();
        expect(
            within(canvas).queryByRole('complementary'),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('complementary', { name: 'Version history' }),
        ).toBeInTheDocument();
    });

    it('retains configuration edits while history is opened and collapsed', () => {
        const { rerender } = renderWithProviders(view(false));
        fireEvent.change(screen.getByRole('textbox'), {
            target: { value: 'edited' },
        });
        rerender(view(true));
        expect(screen.getByRole('textbox')).toHaveValue('edited');
        rerender(view(false));
        expect(screen.getByRole('textbox')).toHaveValue('edited');
        expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    });
});
