import { Box, Tabs, Text } from '@mantine/core';
import { IconCodeCircle } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import MantineIcon from '../../../components/common/MantineIcon';
import { Table } from '../../../components/DataViz/visualizations/Table';
import { SemanticViewerResultsRunner } from '../runners/SemanticViewerResultsRunner';
import { useAppSelector } from '../store/hooks';
import {
    selectResultsTableVizConfig,
    selectSemanticLayerInfo,
    selectSemanticLayerQuery,
} from '../store/selectors';
import SqlViewer from './SqlViewer';

enum TabPanel {
    SQL = 'SQL',
}

const ContentResults: FC = () => {
    const semanticViewerInfo = useAppSelector(selectSemanticLayerInfo);
    const semanticQuery = useAppSelector(selectSemanticLayerQuery);
    const { results, columns } = useAppSelector(
        (state) => state.semanticViewer,
    );

    const resultsTableVizConfig = useAppSelector(selectResultsTableVizConfig);

    const [openPanel, setOpenPanel] = useState<TabPanel>();

    const handleOpenPanel = (panel: TabPanel) => {
        setOpenPanel(panel);
    };

    const handleClosePanel = () => {
        setOpenPanel(undefined);
    };

    const resultsRunner = useMemo(() => {
        return new SemanticViewerResultsRunner({
            query: semanticQuery,
            rows: results ?? [],
            columns: columns ?? [],
            projectUuid: semanticViewerInfo.projectUuid,
        });
    }, [columns, semanticViewerInfo, results, semanticQuery]);

    return (
        <>
            <PanelGroup direction="vertical">
                <Panel
                    id="semantic-viewer-panel-results"
                    order={1}
                    minSize={30}
                    style={{ display: 'flex' }}
                >
                    <Table
                        resultsRunner={resultsRunner}
                        columnsConfig={resultsTableVizConfig.columns}
                        flexProps={{
                            m: '-1px',
                        }}
                    />
                </Panel>

                {openPanel === TabPanel.SQL && (
                    <>
                        <Box
                            component={PanelResizeHandle}
                            bg="gray.3"
                            h="two"
                            sx={(theme) => ({
                                transition: 'background-color 0.2s ease-in-out',
                                '&[data-resize-handle-state="hover"]': {
                                    backgroundColor: theme.colors.gray[5],
                                },
                                '&[data-resize-handle-state="drag"]': {
                                    backgroundColor: theme.colors.gray[8],
                                },
                            })}
                        />

                        <Panel
                            id={`semantic-viewer-panel-tab-${TabPanel.SQL}`}
                            collapsible
                            order={2}
                            defaultSize={25}
                            minSize={10}
                            onCollapse={() => setOpenPanel(undefined)}
                        >
                            <SqlViewer />
                        </Panel>
                    </>
                )}
            </PanelGroup>

            <Tabs
                color="gray"
                inverted
                allowTabDeactivation
                value={openPanel ?? null}
                onTabChange={(newTabValue: TabPanel | null) => {
                    if (newTabValue) {
                        handleOpenPanel(newTabValue);
                    } else {
                        handleClosePanel();
                    }
                }}
            >
                <Tabs.List style={{ alignItems: 'center' }} pb="two">
                    <Tabs.Tab
                        value={TabPanel.SQL}
                        h="xxl"
                        px="lg"
                        icon={<MantineIcon icon={IconCodeCircle} />}
                    >
                        View SQL
                    </Tabs.Tab>

                    <Text ml="auto" mr="lg" fz="sm">
                        Total rows:{' '}
                        <Text span fw={500}>
                            {results.length}
                        </Text>
                    </Text>
                </Tabs.List>
            </Tabs>
        </>
    );
};

export default ContentResults;
