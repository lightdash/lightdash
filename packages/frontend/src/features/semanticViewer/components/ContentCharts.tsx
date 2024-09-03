import {
    ChartKind,
    FieldType,
    isVizTableConfig,
    SemanticLayerSortByDirection,
} from '@lightdash/common';
import { Box, Button, Group, Tabs, Text, useMantineTheme } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconTable } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import MantineIcon from '../../../components/common/MantineIcon';
import { selectChartConfigByKind } from '../../../components/DataViz/store/selectors';
import ChartView from '../../../components/DataViz/visualizations/ChartView';
import { Table } from '../../../components/DataViz/visualizations/Table';
import { SemanticViewerResultsRunner } from '../runners/SemanticViewerResultsRunner';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
    selectAllSelectedFieldsByKind,
    selectSemanticLayerInfo,
    selectSemanticLayerQuery,
} from '../store/selectors';
import { updateSortBy } from '../store/semanticViewerSlice';

enum TabPanel {
    VISUALIZATION_TABLE = 'VISUALIZATION_TABLE',
}

const ContentCharts: FC = () => {
    const mantineTheme = useMantineTheme();
    const dispatch = useAppDispatch();

    const { projectUuid } = useAppSelector(selectSemanticLayerInfo);
    const semanticQuery = useAppSelector(selectSemanticLayerQuery);

    const { results, columns, activeChartKind, sortBy } = useAppSelector(
        (state) => state.semanticViewer,
    );

    const vizConfig = useAppSelector((state) =>
        selectChartConfigByKind(state, state.semanticViewer.activeChartKind),
    );

    const allSelectedFieldsByKind = useAppSelector(
        selectAllSelectedFieldsByKind,
    );

    const resultsRunner = useMemo(() => {
        return new SemanticViewerResultsRunner({
            query: semanticQuery,
            rows: results ?? [],
            columns: columns ?? [],
            projectUuid,
        });
    }, [columns, projectUuid, results, semanticQuery]);

    const [openPanel, setOpenPanel] = useState<TabPanel>();

    const handleOpenPanel = (panel: TabPanel) => {
        setOpenPanel(panel);
    };

    const handleClosePanel = () => {
        setOpenPanel(undefined);
    };

    const handleAddSortBy = (fieldName: string, kind: FieldType) => {
        dispatch(updateSortBy({ name: fieldName, kind }));
    };

    return (
        <>
            <PanelGroup direction="vertical">
                <Panel
                    id="semantic-viewer-panel-charts"
                    order={1}
                    minSize={30}
                    style={{ display: 'flex', flexDirection: 'column' }}
                >
                    <Group m="md" spacing="xxs" align="baseline">
                        <Text fw={600} h="100%" mr="xs">
                            Sort by:
                        </Text>
                        {Object.entries(allSelectedFieldsByKind).map(
                            ([kind, fields]) =>
                                fields.map((field) => {
                                    // TODO: this is annoying
                                    const normalKind =
                                        kind === 'metrics'
                                            ? FieldType.METRIC
                                            : FieldType.DIMENSION;

                                    const sortDirection = sortBy.find(
                                        (s) =>
                                            s.name === field.name &&
                                            s.kind === normalKind,
                                    )?.direction;

                                    return (
                                        <Button
                                            key={`${kind}-${field.name}`}
                                            variant={
                                                sortDirection
                                                    ? 'filled'
                                                    : 'outline'
                                            }
                                            size="sm"
                                            mr="xs"
                                            mb="xs"
                                            color={
                                                kind === 'metrics'
                                                    ? 'orange'
                                                    : 'blue'
                                            }
                                            compact
                                            onClick={() =>
                                                handleAddSortBy(
                                                    field.name,
                                                    normalKind,
                                                )
                                            }
                                            rightIcon={
                                                sortDirection && (
                                                    <MantineIcon
                                                        icon={
                                                            sortDirection ===
                                                            SemanticLayerSortByDirection.ASC
                                                                ? IconArrowUp
                                                                : IconArrowDown
                                                        }
                                                    ></MantineIcon>
                                                )
                                            }
                                        >
                                            {field.name}
                                        </Button>
                                    );
                                }),
                        )}
                    </Group>
                    {vizConfig && isVizTableConfig(vizConfig) ? (
                        <Table
                            key={vizConfig.type}
                            resultsRunner={resultsRunner}
                            config={vizConfig}
                            flexProps={{
                                m: '-1px',
                                w: '100%',
                                sx: { flexGrow: 1 },
                            }}
                        />
                    ) : vizConfig && !isVizTableConfig(vizConfig) ? (
                        <ChartView
                            key={vizConfig.type}
                            resultsRunner={resultsRunner}
                            data={{ results, columns }}
                            config={vizConfig}
                            isLoading={false}
                            style={{
                                flexGrow: 1,
                                width: '100%',
                                marginTop: mantineTheme.spacing.sm,
                            }}
                        />
                    ) : null}
                </Panel>

                {openPanel === TabPanel.VISUALIZATION_TABLE && (
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
                            id={`semantic-viewer-panel-tab-${TabPanel.VISUALIZATION_TABLE}`}
                            collapsible
                            order={2}
                            defaultSize={25}
                            minSize={10}
                            onCollapse={() => setOpenPanel(undefined)}
                        >
                            table visualization goes here...
                        </Panel>
                    </>
                )}
            </PanelGroup>

            {activeChartKind !== ChartKind.TABLE ? (
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
                            value={TabPanel.VISUALIZATION_TABLE}
                            h="xxl"
                            px="lg"
                            icon={<MantineIcon icon={IconTable} />}
                        >
                            Visualization Data
                        </Tabs.Tab>
                    </Tabs.List>
                </Tabs>
            ) : null}
        </>
    );
};

export default ContentCharts;
