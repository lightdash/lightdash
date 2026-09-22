import { type Item } from '@lightdash/common';

/** The saved chart whose query backs a builder session. */
export type AttachedSavedChart = {
    status: 'running' | 'ready' | 'error';
    chartName: string;
    spaceName: string | null;
    /** Rows the run returned; null until it finishes. */
    rowCount: number | null;
    /** Result columns, dimensions before metrics; empty until the run is ready. */
    columns: Item[];
    /** When the run finished; null until it does. */
    ranAt: Date | null;
    /** Why the run failed; null unless `status` is 'error'. */
    message: string | null;
};

/** Which rows the preview renders: the fabricated sample or the attached
 *  chart's run. The chart stays attached either way. */
export type PreviewSource = 'sample' | 'chart';

/** One chart the picker handed back. */
export type PickedSavedChart = { uuid: string; name: string };

/**
 * Attaching, inspecting and detaching that chart, offered wherever the author
 * can reach it: the canvas card, the composer chip and the sidebar. Null on a
 * host that has no saved-chart source of its own.
 */
export type SavedChartSourceControls = {
    attached: AttachedSavedChart | null;
    /** What the preview renders; 'chart' only while one is attached. */
    previewSource: PreviewSource;
    setPreviewSource: (source: PreviewSource) => void;
    /** Whether the composer's sample-data button is on, so the run's rows
     *  travel with the next prompt. */
    includeRows: boolean;
    setIncludeRows: (included: boolean) => void;
    attach: (chart: PickedSavedChart) => void;
    detach: () => void;
    viewRows: () => void;
    retry: () => void;
};
