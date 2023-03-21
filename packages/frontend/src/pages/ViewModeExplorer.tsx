import { Helmet } from 'react-helmet';
import { useParams } from 'react-router-dom';
import { Transition } from 'react-transition-group';
import {
    CardContent,
    Drawer,
    PageContentContainer,
    PageWrapper,
    Resizer,
    StickySidebar,
    WidthHack,
} from '../components/common/Page/Page.styles';
import Explorer from '../components/Explorer';
import ExplorePanel from '../components/Explorer/ExplorePanel';
import SavedChartsHeader from '../components/Explorer/SavedChartsHeader';
import { useViewChartResults } from '../hooks/useQueryResults';
import { useSavedQuery } from '../hooks/useSavedQuery';
import useSidebarResize from '../hooks/useSidebarResize';
import {
    ExplorerProvider,
    ExplorerSection,
} from '../providers/ExplorerProvider';

const ViewModeExplorer = () => {
    const { savedQueryUuid } = useParams<{
        savedQueryUuid: string;
        projectUuid: string;
    }>();
    const { data } = useSavedQuery({
        id: savedQueryUuid,
    });
    const queryResults = useViewChartResults();

    return (
        <ExplorerProvider
            queryResults={queryResults}
            isEditMode={false}
            initialState={
                data
                    ? {
                          shouldFetchResults: true,
                          expandedSections: [ExplorerSection.VISUALIZATION],
                          unsavedChartVersion: {
                              tableName: data.tableName,
                              chartConfig: data.chartConfig,
                              metricQuery: data.metricQuery,
                              tableConfig: data.tableConfig,
                              pivotConfig: data.pivotConfig,
                          },
                      }
                    : undefined
            }
            savedChart={data}
        >
            <Helmet>
                <title>{data?.name} - Lightdash</title>
            </Helmet>
            <SavedChartsHeader />

            <PageWrapper>
                <PageContentContainer>
                    <Explorer />
                </PageContentContainer>
            </PageWrapper>
        </ExplorerProvider>
    );
};

export default ViewModeExplorer;
