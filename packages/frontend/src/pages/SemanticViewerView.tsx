import { useParams } from 'react-router-dom';
import Page from '../components/common/Page/Page';
import { useSemanticLayerInfo } from '../features/semanticViewer/api/hooks';

const SemanticViewerViewPage = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const { data: info } = useSemanticLayerInfo({ projectUuid });

    return (
        <Page
            title="Semantic Viewer"
            withFullHeight
            noContentPadding
            withSidebarBorder
            noSidebarPadding
        >
            {JSON.stringify(info)}
        </Page>
    );
};

export default SemanticViewerViewPage;
