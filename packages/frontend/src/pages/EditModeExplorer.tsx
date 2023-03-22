import { Card } from '@blueprintjs/core';
import { Helmet } from 'react-helmet';
import { useParams } from 'react-router-dom';
import {
    CardContent,
    PageContentContainer,
    PageWrapper,
    StickySidebar,
} from '../components/common/Page/Page.styles';
import Explorer from '../components/Explorer';
import ExplorePanel from '../components/Explorer/ExplorePanel';
import SavedChartsHeader from '../components/Explorer/SavedChartsHeader';
import { useQueryResults } from '../hooks/useQueryResults';
import { useSavedQuery } from '../hooks/useSavedQuery';
import {
    ExplorerProvider,
    ExplorerSection,
} from '../providers/ExplorerProvider';

const EditModeExplorer = () => {
    const { savedQueryUuid } = useParams<{
        savedQueryUuid: string;
        projectUuid: string;
    }>();
    const isEditMode = true;
    const { data } = useSavedQuery({
        id: savedQueryUuid,
    });

    const queryResults = useQueryResults();

    return (
        <ExplorerProvider
            queryResults={queryResults}
            isEditMode={isEditMode}
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
                <StickySidebar $pageHasHeader>
                    <Card elevation={1}>
                        <CardContent>
                            <ExplorePanel />
                        </CardContent>
                    </Card>
                </StickySidebar>

                <PageContentContainer hasDraggableSidebar>
                    <Explorer />
                </PageContentContainer>
            </PageWrapper>
        </ExplorerProvider>
    );
};

export default EditModeExplorer;
