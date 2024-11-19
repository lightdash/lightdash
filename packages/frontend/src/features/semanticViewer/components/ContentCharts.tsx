import { ChartKind, isVizTableConfig, TableDataModel } from '@lightdash/common';
import { Box, Tabs, useMantineTheme } from '@mantine/core';
import { IconTable } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useAsync } from 'react-use';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    selectChartDisplayByKind,
    selectChartFieldConfigByKind,
    selectCompleteConfigByKind,
} from '../../../components/DataViz/store/selectors';
import getChartDataModel from '../../../components/DataViz/transformers/getChartDataModel';
import { ChartDataTable } from '../../../components/DataViz/visualizations/ChartDataTable';
import ChartView from '../../../components/DataViz/visualizations/ChartView';
import { Table } from '../../../components/DataViz/visualizations/Table';

import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { SemanticViewerResultsRunnerFrontend } from '../runners/SemanticViewerResultsRunnerFrontend';
import {
    selectFilters,
    selectSemanticLayerInfo,
    selectSemanticLayerQuery,
    selectSortBy,
} from '../store/selectors';

enum TabPanel {
    VISUALIZATION_TABLE = 'VISUALIZATION_TABLE',
}

type ContentChartsProps = {
    onTableHeaderClick: (fieldName: string) => void;
};

const ContentCharts: FC<ContentChartsProps> = ({ onTableHeaderClick }) => {
    const mantineTheme = useMantineTheme();
    const { data: organization } = useOrganization();
    const { projectUuid } = useAppSelector(selectSemanticLayerInfo);
    const [openPanel, setOpenPanel] = useState<TabPanel>();
    const { results, columnNames, activeChartKind, fields } = useAppSelector(
        (state) => state.semanticViewer,
    );

    const filters = useAppSelector(selectFilters);
    const sortBy = useAppSelector(selectSortBy);

    const fieldConfig = useAppSelector((state) =>
        selectChartFieldConfigByKind(state, activeChartKind),
    );
    const display = useAppSelector((state) =>
        selectChartDisplayByKind(state, activeChartKind),
    );

    const completeConfig = useAppSelector((state) =>
        selectCompleteConfigByKind(state, activeChartKind),
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
        return getChartDataModel(
            resultsRunner,
            fieldConfig,
            activeChartKind ?? ChartKind.TABLE,
        );
    }, [fieldConfig, activeChartKind, resultsRunner]);

    const { loading: chartLoading, error: chartError } = useAsync(
        async () =>
            vizDataModel.getPivotedChartData({
                ...semanticLayerQuery,
                filters,
                sortBy,
            }),
        [semanticLayerQuery, vizDataModel],
    );

    const { spec, tableData } = useMemo(
        () => ({
            spec: vizDataModel.getSpec(display, organization?.chartColors),
            tableData: vizDataModel.getPivotedTableData(),
        }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [vizDataModel, display, chartLoading],
    );

    const handleOpenPanel = (panel: TabPanel) => {
        setOpenPanel(panel);
    };

    const handleClosePanel = () => {
        setOpenPanel(undefined);
    };

    // TODO: this is a static method on the table, but the sort
    // is really a property of the page/query. Is there a better place for it?
    const tableVizSorts = useMemo(() => {
        return TableDataModel.getTableHeaderSortConfig(
            resultsRunner.getColumnNames(),
            semanticLayerQuery,
        );
    }, [resultsRunner, semanticLayerQuery]);

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
                    {completeConfig && isVizTableConfig(completeConfig) ? (
                        <Table
                            resultsRunner={resultsRunner}
                            columnsConfig={completeConfig.columns}
                            thSortConfig={tableVizSorts}
                            onTHClick={onTableHeaderClick}
                            flexProps={{
                                m: '-1px',
                                w: '100%',
                                sx: { flexGrow: 1 },
                            }}
                        />
                    ) : completeConfig && !isVizTableConfig(completeConfig) ? (
                        <ChartView
                            config={completeConfig} // Config only used for error messaging
                            spec={spec}
                            isLoading={chartLoading}
                            error={chartError}
                            style={{
                                flexGrow: 1,
                                width: '100%',
                                height: '100%',
                                marginTop: mantineTheme.spacing.sm,
                            }}
                        />
                    ) : null}
                </Panel>

                {openPanel === TabPanel.VISUALIZATION_TABLE &&
                    !isVizTableConfig(completeConfig) && (
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
                                <ChartDataTable
                                    columnNames={tableData?.columns ?? []}
                                    rows={tableData?.rows ?? []}
                                    onTHClick={onTableHeaderClick}
                                    thSortConfig={tableVizSorts}
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
