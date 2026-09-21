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
    | {
          kind: 'live';
          exploreLabel: string;
          rowCount: number;
          ranAt: Date;
      }
    | { kind: 'mismatch'; issueCount: number }
    | { kind: 'unavailable'; message: string };

/** What the preview draws on. A query selection carries the columns to bind
 *  from; it never implies that anything has been run. */
export type PreviewDataSelection =
    | { kind: 'sample' }
    | {
          kind: 'query';
          exploreName: string;
          savedChart: { uuid: string; name: string } | null;
          /** Filters, sorts, table calculations and custom fields the
           *  selection brought with it; the bound inputs supply the columns. */
          metricQuery: MetricQuery;
          fieldMapping: DataAppVizFieldMapping;
      };

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
