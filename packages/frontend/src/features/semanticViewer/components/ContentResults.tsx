import type { ApiError } from '@lightdash/common';
import { TableDataModel } from '@lightdash/common';
import { Box, Tabs, Text } from '@mantine/core';
import { IconCodeCircle } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import MantineIcon from '../../../components/common/MantineIcon';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { Table } from '../../../components/DataViz/visualizations/Table';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { SemanticViewerResultsRunnerFrontend } from '../runners/SemanticViewerResultsRunnerFrontend';
import {
    selectResultsTableVizConfig,
    selectSemanticLayerInfo,
    selectSemanticLayerQuery,
} from '../store/selectors';
import SqlViewer from './SqlViewer';

enum TabPanel {
    SQL = 'SQL',
}

type ContentResultsProps = {
    resultsError?: ApiError;
    onTableHeaderClick: (fieldName: string) => void;
};

const ContentResults: FC<ContentResultsProps> = ({
    onTableHeaderClick,
    resultsError,
}) => {
    const semanticViewerInfo = useAppSelector(selectSemanticLayerInfo);

    const resultsTableVizConfig = useAppSelector(selectResultsTableVizConfig);
    const { results, columnNames, fields } = useAppSelector(
        (state) => state.semanticViewer,
    );

    const [openPanel, setOpenPanel] = useState<TabPanel>();

    const handleOpenPanel = (panel: TabPanel) => {
        setOpenPanel(panel);
    };

    const handleClosePanel = () => {
        setOpenPanel(undefined);
    };

    const semanticLayerQuery = useAppSelector((state) =>
        selectSemanticLayerQuery(state),
    );

    const resultsRunner = useMemo(() => {
        return new SemanticViewerResultsRunnerFrontend({
            rows: results ?? [],
            columnNames: columnNames ?? [],
            fields,
            projectUuid: semanticViewerInfo.projectUuid,
        });
    }, [results, columnNames, semanticViewerInfo.projectUuid, fields]);

    const thSortConfig = useMemo(() => {
        return TableDataModel.getTableHeaderSortConfig(
            columnNames,
            semanticLayerQuery,
        );
    }, [columnNames, semanticLayerQuery]);

    return (
        <>
            <PanelGroup direction="vertical">
                <Panel
                    id="semantic-viewer-panel-results"
                    order={1}
                    minSize={30}
                    style={{ display: 'flex' }}
                >
                    {resultsError ? (
                        <SuboptimalState
                            title="Failed to fetch results"
                            description={
                                resultsError.error.message ??
                                'Please check your filters and field selection.'
                            }
                        />
                    ) : results.length > 0 ? (
                        <Table
                            resultsRunner={resultsRunner}
                            columnsConfig={resultsTableVizConfig.columns}
                            thSortConfig={thSortConfig}
                            onTHClick={onTableHeaderClick}
                            flexProps={{
                                m: '-1px',
                            }}
                        />
                    ) : (
                        <SuboptimalState
                            title="No results"
                            description="Select fields and adjust filters to see results."
                        />
                    )}
                </Panel>

                {openPanel === TabPanel.SQL && (
                    <>
                        <Box
                            component={PanelResizeHandle}
                            bg="gray.2"
                            h="xs"
                            sx={(theme) => ({
                                transition: 'background-color 0.2s ease-in-out',
                                '&[data-resize-handle-state="hover"]': {
                                    backgroundColor: theme.colors.gray[3],
                                },
                                '&[data-resize-handle-state="drag"]': {
                                    backgroundColor: theme.colors.gray[4],
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
