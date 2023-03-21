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
    const isEditMode = false;
    const { data } = useSavedQuery({
        id: savedQueryUuid,
    });
    const { sidebarRef, sidebarWidth, isResizing, startResizing } =
        useSidebarResize({
            defaultWidth: 400,
            minWidth: 300,
            maxWidth: 600,
        });

    const queryResults = useViewChartResults();

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
                    <Transition in={isEditMode} timeout={500}>
                        {(state) => (
                            <>
                                <Drawer
                                    elevation={1}
                                    $state={state}
                                    style={{
                                        width: sidebarWidth,
                                        left: [
                                            'exiting',
                                            'exited',
                                            'unmounted',
                                        ].includes(state)
                                            ? -sidebarWidth
                                            : 0,
                                    }}
                                >
                                    <CardContent>
                                        <ExplorePanel />
                                    </CardContent>
                                </Drawer>

                                <WidthHack
                                    ref={sidebarRef}
                                    $state={state}
                                    style={{
                                        width: [
                                            'exiting',
                                            'exited',
                                            'unmounted',
                                        ].includes(state)
                                            ? 0
                                            : sidebarWidth + 5,
                                    }}
                                >
                                    {isEditMode && (
                                        <Resizer
                                            onMouseDown={startResizing}
                                            $isResizing={isResizing}
                                        />
                                    )}
                                </WidthHack>
                            </>
                        )}
                    </Transition>
                </StickySidebar>

                <PageContentContainer hasDraggableSidebar>
                    <Explorer />
                </PageContentContainer>
            </PageWrapper>
        </ExplorerProvider>
    );
};

export default ViewModeExplorer;
