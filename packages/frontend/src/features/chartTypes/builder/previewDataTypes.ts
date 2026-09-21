import {
    type DataAppVizFieldMapping,
    type ItemsMap,
    type MetricQuery,
    type ReadyQueryResultsPage,
    type ResultRow,
} from '@lightdash/common';
import { type ChartTypeFitIssue } from '../utils/chartTypePreviewFit';

/** What the canvas is showing, and where its rows came from. Always stated
 *  on screen — the strip never claims a source the chart does not have. */
export type PreviewDataSource =
    | { kind: 'sample' }
    /** The last session's inputs are bound and nothing has been run against
     *  them, so the canvas is still on sample data. A null count means the
     *  explore behind them is still resolving. */
    | { kind: 'remembered'; exploreLabel: string; fieldCount: number | null }
    | {
          kind: 'live';
          exploreLabel: string;
          rowCount: number;
          ranAt: Date;
      }
    | { kind: 'mismatch'; issueCount: number }
    | { kind: 'unavailable'; message: string };

/** The columns a run would bind from. Holding one never implies that anything
 *  has been run. */
export type PreviewQuerySelection = {
    kind: 'query';
    exploreName: string;
    savedChart: { uuid: string; name: string } | null;
    /** Filters, sorts, table calculations and custom fields the selection
     *  brought with it; the bound inputs supply the columns. */
    metricQuery: MetricQuery;
    fieldMapping: DataAppVizFieldMapping;
};

/** What the preview draws on. */
export type PreviewDataSelection = { kind: 'sample' } | PreviewQuerySelection;

export type PreviewRunState =
    | { status: 'notRun' }
    | { status: 'running' }
    | {
          status: 'ready';
          rows: ResultRow[];
          itemsMap: ItemsMap;
          pivotDetails: ReadyQueryResultsPage['pivotDetails'];
          rowCount: number;
          ranAt: Date;
      }
    | { status: 'error'; message: string };

export type PreviewFitState =
    | { status: 'notApplicable' }
    | { status: 'resolving' }
    | { status: 'fits' }
    | { status: 'doesNotFit'; issues: ChartTypeFitIssue[] }
    /** The explore behind the selection could not be read at all. */
    | { status: 'unavailable'; message: string };
