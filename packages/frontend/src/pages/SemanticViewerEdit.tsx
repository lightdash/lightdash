import { subject } from '@casl/ability';
import type { SpaceShare } from '@lightdash/common';
import { useEffect, useMemo } from 'react';
import { Provider } from 'react-redux';
import { useHistory, useParams, useRouteMatch } from 'react-router-dom';
import Page from '../components/common/Page/Page';
import { setChartOptionsAndConfig } from '../components/DataViz/store/actions/commonChartActions';
import getChartConfigAndOptions from '../components/DataViz/transformers/getChartConfigAndOptions';
import * as SemanticViewer from '../features/semanticViewer';
import {
    useSavedSemanticViewerChart,
    useSavedSemanticViewerChartResults,
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
import { useApp } from '../providers/AppProvider';

const SemanticViewerEditorPageWithStore = () => {
    const { user } = useApp();
    const { projectUuid, savedSemanticViewerChartSlug } = useParams<{
        projectUuid: string;
        savedSemanticViewerChartSlug?: string;
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
        { projectUuid, findBy: { slug: savedSemanticViewerChartSlug } },
        { enabled: !!savedSemanticViewerChartSlug },
    );

    const chartResultsQuery = useSavedSemanticViewerChartResults(
        { projectUuid, findBy: { slug: savedSemanticViewerChartSlug } },
        { enabled: !!savedSemanticViewerChartSlug },
    );

    const fieldsQuery = useSemanticLayerViewFields(
        {
            projectUuid,
            // TODO: this should never be empty or that hook should receive a null view!
            semanticLayerView: chartQuery.data?.semanticLayerView ?? '',
            semanticLayerQuery: chartQuery.data?.semanticLayerQuery,
        },
        { enabled: chartQuery.isSuccess },
    );

    const resultsRunner = useMemo(() => {
        if (
            !fieldsQuery.isSuccess ||
            !chartQuery.isSuccess ||
            !chartResultsQuery.isSuccess
        ) {
            return;
        }

        const vizColumns =
            SemanticViewerResultsRunner.convertColumnsToVizColumns(
                fieldsQuery.data,
                chartResultsQuery.data.columns,
            );

        return new SemanticViewerResultsRunner({
            projectUuid,
            fields: fieldsQuery.data,
            query: chartQuery.data.semanticLayerQuery,
            rows: chartResultsQuery.data.results,
            columns: vizColumns,
        });
    }, [
        chartQuery.data,
        chartQuery.isSuccess,
        chartResultsQuery.data,
        chartResultsQuery.isSuccess,
        fieldsQuery.data,
        fieldsQuery.isSuccess,
        projectUuid,
    ]);

    const savedChartSpaceUserAccess = chartQuery.isSuccess && chartQuery.data.chart.space.userAccess 
        ? [chartQuery.data.chart.space.userAccess] 
        : [];

    const canManageSemanticViewer = user.data?.ability?.can(
        'manage',
        subject('SemanticViewer', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
            access: savedChartSpaceUserAccess,
        }),
    );

    const canSaveChart = user.data?.ability?.can(
        'create',
        subject('SavedChart', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
            access: savedChartSpaceUserAccess,
        }),
    );

    useEffect(() => {
        if (semanticViewerState === SemanticViewerStateStatus.INITIALIZED) {
            return;
        }

        // If we have a saved chart, initialize the viewer with it
        if (
            savedSemanticViewerChartSlug &&
            chartQuery.isSuccess &&
            infoQuery.isSuccess &&
            resultsRunner
        ) {
            const chartResultOptions = getChartConfigAndOptions(
                resultsRunner,
                chartQuery.data.chartKind,
                chartQuery.data.config,
            );

            dispatch(setChartOptionsAndConfig(chartResultOptions));
            dispatch(
                initializeSemanticViewer({
                    projectUuid,
                    info: infoQuery.data,
                    chart: chartQuery.data,
                }),
            );
        }

        // If we don't have a saved chart, initialize the viewer with an empty chart
        if (!savedSemanticViewerChartSlug && infoQuery.isSuccess) {
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
        savedSemanticViewerChartSlug,
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
    if (
        infoQuery.isError ||
        fieldsQuery.isError ||
        chartQuery.isError ||
        chartResultsQuery.isError
    ) {
        return null;
    }

    // TODO: add loading state
    if (semanticViewerState === SemanticViewerStateStatus.LOADING) return null;

    return (
        <Page
            title="Semantic Viewer"
            withFullHeight
            noContentPadding
            withSidebarBorder
            noSidebarPadding
            sidebar={
                <SemanticViewer.Sidebar
                    shouldShowSave={canManageSemanticViewer && canSaveChart}
                />
            }
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
