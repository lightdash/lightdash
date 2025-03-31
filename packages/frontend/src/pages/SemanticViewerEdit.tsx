import { subject } from '@casl/ability';
import { useEffect, useMemo } from 'react';
import { Provider } from 'react-redux';
import { useMatch, useNavigate, useParams } from 'react-router';
import { useUnmount } from 'react-use';
import { setChartOptionsAndConfig } from '../components/DataViz/store/actions/commonChartActions';
import { getChartConfigAndOptions } from '../components/DataViz/transformers/getChartConfigAndOptions';
import Page from '../components/common/Page/Page';
import * as SemanticViewer from '../features/semanticViewer';
import {
    useSavedSemanticViewerChart,
    useSavedSemanticViewerChartResults,
    useSemanticLayerInfo,
    useSemanticLayerViewFields,
} from '../features/semanticViewer/api/hooks';
import { SemanticViewerResultsRunnerFrontend } from '../features/semanticViewer/runners/SemanticViewerResultsRunnerFrontend';
import { selectSemanticViewerState } from '../features/semanticViewer/store/selectors';
import {
    SemanticViewerStateStatus,
    initializeSemanticViewer,
    resetState,
} from '../features/semanticViewer/store/semanticViewerSlice';
import { store } from '../features/sqlRunner/store';
import {
    useAppDispatch,
    useAppSelector,
} from '../features/sqlRunner/store/hooks';
import useApp from '../providers/App/useApp';

const SemanticViewerEditorPageWithStore = () => {
    const { user } = useApp();
    const { projectUuid, savedSemanticViewerChartSlug } = useParams<{
        projectUuid: string;
        savedSemanticViewerChartSlug?: string;
    }>();

    const rootRouteMatch = useMatch({
        path: `/projects/${projectUuid}/semantic-viewer`,
    });
    const navigate = useNavigate();

    const dispatch = useAppDispatch();
    const semanticViewerState = useAppSelector(selectSemanticViewerState);

    const infoQuery = useSemanticLayerInfo({ projectUuid });

    const isSemanticLayerConnected =
        infoQuery.isSuccess && infoQuery.data !== undefined;

    const chartQuery = useSavedSemanticViewerChart(
        {
            projectUuid,
            findBy: { slug: savedSemanticViewerChartSlug },
        },
        { enabled: isSemanticLayerConnected && !!savedSemanticViewerChartSlug },
    );

    const chartResultsQuery = useSavedSemanticViewerChartResults(
        {
            projectUuid,
            findBy: { slug: savedSemanticViewerChartSlug },
        },
        { enabled: isSemanticLayerConnected && !!savedSemanticViewerChartSlug },
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
            !chartResultsQuery.isSuccess ||
            !projectUuid
        ) {
            return;
        }

        return new SemanticViewerResultsRunnerFrontend({
            projectUuid,
            fields: fieldsQuery.data,
            rows: chartResultsQuery.data.results,
            columnNames: chartResultsQuery.data.columns,
        });
    }, [
        projectUuid,
        fieldsQuery.isSuccess,
        fieldsQuery.data,
        chartQuery.isSuccess,
        chartResultsQuery.isSuccess,
        chartResultsQuery.data,
    ]);

    const savedChartSpaceUserAccess =
        chartQuery.isSuccess && chartQuery.data.space.userAccess
            ? [chartQuery.data.space.userAccess]
            : [];

    const canSaveChart = user.data?.ability?.can(
        'create',
        subject('SavedChart', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
            access: savedChartSpaceUserAccess,
        }),
    );

    useEffect(() => {
        if (infoQuery.isSuccess && !infoQuery.data) {
            void navigate(`/projects/${projectUuid}`, { replace: true });
        }
    }, [infoQuery.isSuccess, infoQuery.data, navigate, projectUuid]);

    useEffect(() => {
        if (!projectUuid) {
            return;
        }

        if (semanticViewerState === SemanticViewerStateStatus.INITIALIZED) {
            return;
        }

        // If we have a saved chart, initialize the viewer with it
        if (
            savedSemanticViewerChartSlug &&
            chartQuery.isSuccess &&
            infoQuery.isSuccess &&
            chartResultsQuery.isSuccess &&
            infoQuery.data &&
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
                    chartData: {
                        chart: chartQuery.data,
                        results: chartResultsQuery.data,
                    },
                }),
            );
        }

        // If we don't have a saved chart, initialize the viewer with an empty chart
        if (
            !savedSemanticViewerChartSlug &&
            infoQuery.isSuccess &&
            infoQuery.data
        ) {
            dispatch(
                initializeSemanticViewer({
                    projectUuid,
                    info: infoQuery.data,
                    chartData: undefined,
                }),
            );
            if (!!rootRouteMatch) {
                void navigate(rootRouteMatch.pathname + '/new', {
                    replace: true,
                });
            }
        }
    }, [
        projectUuid,
        savedSemanticViewerChartSlug,
        rootRouteMatch,
        navigate,
        dispatch,
        semanticViewerState,
        infoQuery.isSuccess,
        infoQuery.data,
        chartQuery.isSuccess,
        chartQuery.data,
        resultsRunner,
        chartResultsQuery.isSuccess,
        chartResultsQuery.data,
    ]);

    useUnmount(() => {
        dispatch(resetState());
    });

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
            sidebar={<SemanticViewer.Sidebar shouldShowSave={canSaveChart} />}
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
