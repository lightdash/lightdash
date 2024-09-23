import { ChartKind, isVizTableConfig, TableDataModel } from '@lightdash/common';
import { Box, Tabs, useMantineTheme } from '@mantine/core';
import { IconTable } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useAsync } from 'react-use';
import MantineIcon from '../../../components/common/MantineIcon';
import { selectChartConfigByKind } from '../../../components/DataViz/store/selectors';
import getChartDataModel from '../../../components/DataViz/transformers/getChartDataModel';
import ChartView from '../../../components/DataViz/visualizations/ChartView';
import { Table } from '../../../components/DataViz/visualizations/Table';
import { Table2 } from '../../../components/DataViz/visualizations/Table2';

import { useOrganization } from '../../../hooks/organization/useOrganization';
import { SemanticViewerResultsRunnerFrontend } from '../runners/SemanticViewerResultsRunner';
import { useAppSelector } from '../store/hooks';
import {
    selectSemanticLayerInfo,
    selectSemanticLayerQuery,
} from '../store/selectors';

enum TabPanel {
    VISUALIZATION_TABLE = 'VISUALIZATION_TABLE',
}

type ContentChartsProps = {
    onTableHeaderClick: (fieldName: string) => void;
};

const ContentCharts: FC<ContentChartsProps> = ({ onTableHeaderClick }) => {
    const mantineTheme = useMantineTheme();
    const { projectUuid } = useAppSelector(selectSemanticLayerInfo);
    const [openPanel, setOpenPanel] = useState<TabPanel>();
    const org = useOrganization();
    const { results, columnNames, activeChartKind, fields, sortBy, filters } =
        useAppSelector((state) => state.semanticViewer);

    // Get config. This could be a UUID fetch on dashboards
    const vizConfig = useAppSelector((state) =>
        selectChartConfigByKind(state, state.semanticViewer.activeChartKind),
    );

    const semanticLayerQuery = useAppSelector((state) =>
        selectSemanticLayerQuery(state),
    );

    const resultsRunner = useMemo(() => {
        return new SemanticViewerResultsRunnerFrontend({
            rows: results ?? [],
            columnNames: columnNames ?? [],
            fields,
            projectUuid,
        });
    }, [columnNames, fields, projectUuid, results]);

    const vizDataModel = useMemo(() => {
        return getChartDataModel(resultsRunner, vizConfig, org.data);
    }, [vizConfig, resultsRunner, org.data]);

    const pivotTableDataModel = useMemo(() => {
        console.log('new tabel model');
        return new TableDataModel({ resultsRunner });
    }, [resultsRunner]);

    const {
        loading: chartLoading,
        error: chartError,
        value: chartSpec,
    } = useAsync(
        async () => vizDataModel.getSpec(semanticLayerQuery),
        [semanticLayerQuery],
    );

    // For the table only -- move to table data model?
    // const pivotResultsRunner = useMemo(() => {
    //     return new SemanticViewerResultsRunnerFrontend({
    //         rows: chartSpec?.results ?? [],
    //         columnNames:
    //             chartVizQuery.data?.columns.map((c) => c.reference) ?? [],
    //         fields: fields,
    //         projectUuid,
    //     });
    // }, [projectUuid, chartSpec, fields]);

    const thSortConfig = useMemo(() => {
        return TableDataModel.getTableHeaderSortConfig(
            columnNames,
            semanticLayerQuery,
        );
    }, [columnNames, semanticLayerQuery]);

    const handleOpenPanel = (panel: TabPanel) => {
        setOpenPanel(panel);
    };

    const handleClosePanel = () => {
        setOpenPanel(undefined);
    };

    return (
        <>
            <PanelGroup direction="vertical">
                <Panel
                    id="semantic-viewer-panel-charts"
                    order={1}
                    minSize={30}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        position: 'relative',
                    }}
                >
                    {vizConfig && isVizTableConfig(vizConfig) ? (
                        <Table
                            resultsRunner={resultsRunner}
                            columnsConfig={vizConfig.columns}
                            thSortConfig={thSortConfig}
                            onTHClick={onTableHeaderClick}
                            flexProps={{
                                m: '-1px',
                                w: '100%',
                                sx: { flexGrow: 1 },
                            }}
                        />
                    ) : vizConfig && !isVizTableConfig(vizConfig) ? (
                        <ChartView
                            config={vizConfig} // Config only used for error messaging
                            spec={chartSpec}
                            isLoading={chartLoading}
                            error={chartError}
                            style={{
                                flexGrow: 1,
                                width: '100%',
                                marginTop: mantineTheme.spacing.sm,
                            }}
                        />
                    ) : null}
                </Panel>

                {openPanel === TabPanel.VISUALIZATION_TABLE &&
                    !isVizTableConfig(vizConfig) && (
                        <>
                            <Box
                                component={PanelResizeHandle}
                                bg="gray.2"
                                h="xs"
                                sx={(theme) => ({
                                    transition:
                                        'background-color 0.2s ease-in-out',
                                    '&[data-resize-handle-state="hover"]': {
                                        backgroundColor: theme.colors.gray[3],
                                    },
                                    '&[data-resize-handle-state="drag"]': {
                                        backgroundColor: theme.colors.gray[4],
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
                                <Table2
                                    dataModel={pivotTableDataModel}
                                    thSortConfig={thSortConfig}
                                />
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
                            Results
                        </Tabs.Tab>
                    </Tabs.List>
                </Tabs>
            ) : null}
        </>
    );
};

export default ContentCharts;
