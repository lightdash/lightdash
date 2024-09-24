import { useEffect } from 'react';
import { Provider } from 'react-redux';
import { useHistory, useParams, useRouteMatch } from 'react-router-dom';
import { useUnmount } from 'react-use';
import Page from '../components/common/Page/Page';
import * as SemanticViewer from '../features/semanticViewer';
import {
    useSavedSemanticViewerChart,
    useSemanticLayerInfo,
} from '../features/semanticViewer/api/hooks';
import { store } from '../features/semanticViewer/store';
import {
    useAppDispatch,
    useAppSelector,
} from '../features/semanticViewer/store/hooks';
import { selectSemanticViewerState } from '../features/semanticViewer/store/selectors';
import {
    initializeSemanticViewer,
    resetState,
    SemanticViewerStateStatus,
    setSemanticLayerInfo,
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

    // TODO: we might not need results here. just chart data should be enough
    const chartQuery = useSavedSemanticViewerChart(
        { projectUuid, uuid: savedSemanticViewerChartUuid ?? null },
        { enabled: !!savedSemanticViewerChartUuid },
    );

    useEffect(() => {
        if (
            semanticViewerState === SemanticViewerStateStatus.INITIALIZED ||
            !infoQuery.isSuccess
        ) {
            return;
        }

        dispatch(setSemanticLayerInfo({ projectUuid, ...infoQuery.data }));

        if (savedSemanticViewerChartUuid && chartQuery.isSuccess) {
            dispatch(initializeSemanticViewer(chartQuery.data.chart));
        } else {
            dispatch(initializeSemanticViewer());
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
    ]);

    useUnmount(() => {
        dispatch(resetState());
    });

    if (infoQuery.isError || chartQuery.isError)
        throw infoQuery.error ?? chartQuery.error;

    // TODO: add loading state
    if (infoQuery.isLoading || chartQuery.isInitialLoading) return null;
    if (semanticViewerState === SemanticViewerStateStatus.LOADING) return null;

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
