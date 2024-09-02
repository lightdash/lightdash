import { useEffect } from 'react';
import { Provider } from 'react-redux';
import { useParams } from 'react-router-dom';
import { useUnmount } from 'react-use';
import Page from '../components/common/Page/Page';
import * as SemanticViewer from '../features/semanticViewer';
import { useSemanticLayerInfo } from '../features/semanticViewer/api/hooks';
import { store } from '../features/semanticViewer/store';
import {
    useAppDispatch,
    useAppSelector,
} from '../features/semanticViewer/store/hooks';
import { selectSemanticViewerState } from '../features/semanticViewer/store/selectors';
import {
    resetState,
    SemanticViewerStateStatus,
    setSemanticLayerInfo,
    setSemanticLayerStatus,
} from '../features/semanticViewer/store/semanticViewerSlice';

const SemanticViewerPageWithStore = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const dispatch = useAppDispatch();
    const semanticViewerState = useAppSelector(selectSemanticViewerState);

    const {
        data: info,
        error,
        isLoading,
        isError,
    } = useSemanticLayerInfo({ projectUuid });

    useEffect(() => {
        if (!info) return;

        dispatch(setSemanticLayerInfo({ projectUuid, ...info }));
        dispatch(setSemanticLayerStatus(SemanticViewerStateStatus.INITIALIZED));
    }, [projectUuid, dispatch, info]);

    useUnmount(() => {
        dispatch(resetState());
    });

    if (isLoading) return null;
    if (isError) throw error;
    if (semanticViewerState === SemanticViewerStateStatus.LOADING) return null;

    return (
        <Page
            title="Semantic Viewer"
            withFullHeight
            withSidebarBorder
            noContentPadding
            sidebar={<SemanticViewer.Sidebar />}
        >
            <SemanticViewer.Content />
        </Page>
    );
};

const SemanticViewerPage = () => {
    return (
        <Provider store={store}>
            <SemanticViewerPageWithStore />
        </Provider>
    );
};

export default SemanticViewerPage;
