import { Provider } from 'react-redux';
import { useParams } from 'react-router-dom';
import { useMount, useUnmount } from 'react-use';
import Page from '../components/common/Page/Page';
import * as SemanticViewer from '../features/semanticViewer';
import { store } from '../features/semanticViewer/store';
import { useAppDispatch } from '../features/semanticViewer/store/hooks';
import {
    resetState,
    setProjectUuid,
} from '../features/semanticViewer/store/semanticViewerSlice';

const SemanticViewerPageWithStore = () => {
    const params = useParams<{ projectUuid: string; slug?: string }>();

    const dispatch = useAppDispatch();

    useMount(() => {
        dispatch(setProjectUuid(params.projectUuid));
    });

    useUnmount(() => {
        dispatch(resetState());
    });

    return (
        <Page
            title="Semantic Viewer"
            withFullHeight
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
