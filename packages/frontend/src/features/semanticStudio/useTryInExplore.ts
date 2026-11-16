import { ChartType, type CreateSavedChartVersion } from '@lightdash/common';
import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { stringifyCreateSavedChartVersion } from '../../hooks/useExplorerRoute';
import { useDevelopmentView } from './developmentView';

const PREVIEW_PROJECT = /\/projects\/([0-9a-f-]{36})/;

/** The project a pull request's preview link points at, or null without one. */
export const findPreviewProjectUuid = (
    previewUrl: string | null | undefined,
): string | null => PREVIEW_PROJECT.exec(previewUrl ?? '')?.[1] ?? null;

/** The fields a change adds or redefines, as Explore names them. */
export type TriedFields = { dimensions: string[]; metrics: string[] };

/** Explore opened on a query, run straight away. */
const getExploreUrlForVersion = (
    projectUuid: string,
    version: CreateSavedChartVersion,
): string => {
    const params = new URLSearchParams({
        create_saved_chart_version: stringifyCreateSavedChartVersion(version),
        isExploreFromHere: 'true',
    });
    return `/projects/${projectUuid}/tables/${encodeURIComponent(version.tableName)}?${params.toString()}`;
};

/** Explore on the model, with the changed fields already selected and run when there are any. */
const getTryInExploreUrl = (
    projectUuid: string,
    model: string,
    fields: TriedFields | null,
): string =>
    !fields || fields.dimensions.length + fields.metrics.length === 0
        ? `/projects/${projectUuid}/tables/${encodeURIComponent(model)}`
        : getExploreUrlForVersion(projectUuid, {
              tableName: model,
              metricQuery: {
                  exploreName: model,
                  dimensions: fields.dimensions,
                  metrics: fields.metrics,
                  filters: {},
                  sorts: [],
                  limit: 500,
                  tableCalculations: [],
                  additionalMetrics: [],
                  customDimensions: [],
              },
              chartConfig: { type: ChartType.TABLE },
              tableConfig: { columnOrder: [] },
              pivotConfig: undefined,
          });

/** Switches the person's queries to their own changes and opens a changed model in Explore, in one step. */
export const useTryInExplore = (projectUuid: string) => {
    const [, setIsOnMyChanges] = useDevelopmentView();
    const navigate = useNavigate();
    return useCallback(
        (
            model: string,
            previewProjectUuid: string | null,
            fields: TriedFields | null,
        ) => {
            setIsOnMyChanges(true, previewProjectUuid);
            void navigate(getTryInExploreUrl(projectUuid, model, fields));
        },
        [projectUuid, setIsOnMyChanges, navigate],
    );
};
