import { pick } from 'lodash';
import { useEffect, useMemo } from 'react';
import { Provider } from 'react-redux';
import { useHistory, useParams, useRouteMatch } from 'react-router-dom';
import Page from '../components/common/Page/Page';
import { setChartOptionsAndConfig } from '../components/DataViz/store/actions/commonChartActions';
import getChartConfigAndOptions from '../components/DataViz/transformers/getChartConfigAndOptions';
import * as SemanticViewer from '../features/semanticViewer';
import {
    useSavedSemanticViewerChart,
    useSemanticLayerInfo,
    useSemanticLayerViewFields,
} from '../features/semanticViewer/api/hooks';
import { SemanticViewerResultsRunner } from '../features/semanticViewer/runners/SemanticViewerResultsRunner';
import { store } from '../features/semanticViewer/store';
import {
    useAppDispatch,
    useAppSelector,
} from '../features/semanticViewer/store/hooks';
import { selectSemanticViewerState } from '../features/semanticViewer/store/selectors';
import {
    initializeSemanticViewer,
    SemanticViewerStateStatus,
} from '../features/semanticViewer/store/semanticViewerSlice';

const SemanticViewerEditorPageWithStore = () => {
    const { projectUuid, savedSemanticViewerChartUuid } = useParams<{
        projectUuid: string;
        savedSemanticViewerChartUuid?: string;
    }>();

    const rootRouteMatch = useRouteMatch({
        path: `/projects/${projectUuid}/semantic-viewer`,
        exact: true,
    });
    const history = useHistory();

    const dispatch = useAppDispatch();
    const semanticViewerState = useAppSelector(selectSemanticViewerState);

    const infoQuery = useSemanticLayerInfo({ projectUuid });

    const chartQuery = useSavedSemanticViewerChart(
        { projectUuid, uuid: savedSemanticViewerChartUuid ?? null },
        { enabled: !!savedSemanticViewerChartUuid },
    );

    const fieldsQuery = useSemanticLayerViewFields(
        {
            projectUuid,
            view: chartQuery.isSuccess
                ? chartQuery.data.chart.semanticLayerView ?? ''
                : '', // TODO: this should never be empty or that hook should receive a null view!
            selectedFields: chartQuery.isSuccess
                ? pick(chartQuery.data.chart.semanticLayerQuery, [
                      'dimensions',
                      'timeDimensions',
                      'metrics',
                  ])
                : { dimensions: [], timeDimensions: [], metrics: [] },
        },
        { enabled: chartQuery.isSuccess },
    );

    const resultsRunner = useMemo(() => {
        if (!chartQuery.isSuccess || !fieldsQuery.isSuccess) return;

        const vizColumns =
            SemanticViewerResultsRunner.convertColumnsToVizColumns(
                fieldsQuery.data,
                chartQuery.data.resultsAndColumns.columns,
            );

        return new SemanticViewerResultsRunner({
            projectUuid,
            fields: fieldsQuery.data,
            query: chartQuery.data.chart.semanticLayerQuery,
            rows: chartQuery.data.resultsAndColumns.results,
            columns: vizColumns,
        });
    }, [chartQuery, fieldsQuery, projectUuid]);

    useEffect(() => {
        if (semanticViewerState === SemanticViewerStateStatus.INITIALIZED) {
            return;
        }

        // If we have a saved chart, initialize the viewer with it
        if (
            savedSemanticViewerChartUuid &&
            chartQuery.isSuccess &&
            infoQuery.isSuccess &&
            resultsRunner
        ) {
            const chartResultOptions = getChartConfigAndOptions(
                resultsRunner,
                chartQuery.data.chart.chartKind,
                chartQuery.data.chart.config,
            );

            dispatch(setChartOptionsAndConfig(chartResultOptions));
            dispatch(
                initializeSemanticViewer({
                    projectUuid,
                    info: infoQuery.data,
                    chart: chartQuery.data.chart,
                }),
            );
        }

        // If we don't have a saved chart, initialize the viewer with an empty chart
        if (!savedSemanticViewerChartUuid && infoQuery.isSuccess) {
            console.log('did this happen?');

            dispatch(
                initializeSemanticViewer({
                    projectUuid,
                    info: infoQuery.data,
                    chart: undefined,
                }),
            );
            if (!!rootRouteMatch) {
                history.replace(rootRouteMatch.path + '/new');
            }
        }
    }, [
        projectUuid,
        savedSemanticViewerChartUuid,
        rootRouteMatch,
        history,
        dispatch,
        semanticViewerState,
        infoQuery.isSuccess,
        infoQuery.data,
        chartQuery.isSuccess,
        chartQuery.data,
        resultsRunner,
    ]);

    // TODO: add error state
    if (infoQuery.isError || chartQuery.isError || fieldsQuery.isError) {
        return null;
    }

    // TODO: add loading state
    if (semanticViewerState === SemanticViewerStateStatus.LOADING) return null;

    console.log(semanticViewerState);

    return (
        <Page
            title="Semantic Viewer"
            withFullHeight
            noContentPadding
            withSidebarBorder
            noSidebarPadding
            sidebar={<SemanticViewer.Sidebar />}
        >
            <SemanticViewer.Content />
        </Page>
    );
};

const SemanticViewerEditorPage = () => {
    return (
        <Provider store={store}>
            <SemanticViewerEditorPageWithStore />
        </Provider>
    );
};

export default SemanticViewerEditorPage;
