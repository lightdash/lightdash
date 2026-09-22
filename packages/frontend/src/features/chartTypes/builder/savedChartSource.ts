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

/** One chart the picker handed back. */
export type PickedSavedChart = { uuid: string; name: string };

/**
 * Attaching, inspecting and detaching that chart, offered wherever the author
 * can reach it: the canvas card, the composer chip and the sidebar. Null on a
 * host that has no saved-chart source of its own.
 */
export type SavedChartSourceControls = {
    attached: AttachedSavedChart | null;
    attach: (chart: PickedSavedChart) => void;
    detach: () => void;
    viewRows: () => void;
    retry: () => void;
};
