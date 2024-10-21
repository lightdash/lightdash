import { ChartKind } from '@lightdash/common';
import { Center, Group, SegmentedControl, Text } from '@mantine/core';
import { IconChartHistogram, IconCodeCircle } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { setChartOptionsAndConfig } from '../../../components/DataViz/store/actions/commonChartActions';
import { selectCompleteConfigByKind } from '../../../components/DataViz/store/selectors';
import { getChartConfigAndOptions } from '../../../components/DataViz/transformers/getChartConfigAndOptions';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import useToaster from '../../../hooks/toaster/useToaster';
import { useAppDispatch, useAppSelector } from '../../sqlRunner/store/hooks';
import { useSemanticLayerQueryResults } from '../api/hooks';
import { SemanticViewerResultsRunnerFrontend } from '../runners/SemanticViewerResultsRunnerFrontend';
import {
    selectAllSelectedFieldNames,
    selectSemanticLayerInfo,
    selectSemanticLayerQuery,
} from '../store/selectors';
import {
    EditorTabs,
    setActiveEditorTab,
    setResults,
    updateSortBy,
} from '../store/semanticViewerSlice';
import ContentCharts from './ContentCharts';
import ContentResults from './ContentResults';
import Filters from './Filters';
import { RunSemanticQueryButton } from './RunSemanticQueryButton';

const Content: FC = () => {
    const dispatch = useAppDispatch();
    const { showToastError } = useToaster();

    const { projectUuid, config } = useAppSelector(selectSemanticLayerInfo);
    const org = useOrganization();
    const semanticQuery = useAppSelector(selectSemanticLayerQuery);
    const allSelectedFieldNames = useAppSelector(selectAllSelectedFieldNames);

    const {
        semanticLayerView,
        results,
        activeEditorTab,
        columnNames,
        fields,
        activeChartKind,
    } = useAppSelector((state) => state.semanticViewer);

    const [hasClickedRunQueryButton, setHasClickedRunQueryButton] =
        useState(false);

    const currentVizConfig = useAppSelector((state) =>
        selectCompleteConfigByKind(state, activeChartKind),
    );

    const {
        data: requestData,
        refetch: runSemanticViewerQuery,
        isFetching: isRunningSemanticLayerQuery,
        error: requestDataError,
    } = useSemanticLayerQueryResults(
        {
            projectUuid,
            query: semanticQuery,
        },
        {
            enabled:
                hasClickedRunQueryButton &&
                (semanticQuery.dimensions.length > 0 ||
                    semanticQuery.timeDimensions.length > 0 ||
                    semanticQuery.metrics.length > 0),
            onError: () => {
                showToastError({
                    title: 'Failed to fetch results',
                });
            },
        },
    );

    const resultsData = useMemo(() => requestData?.results, [requestData]);
    const resultsColumns = useMemo(() => requestData?.columns, [requestData]);

    useEffect(() => {
        if (!resultsColumns || !resultsData) return;

        // TODO: this shouldn't be calculated here, we should be getting this
        // information fro the API
        const vizColumns =
            SemanticViewerResultsRunnerFrontend.convertColumnsToVizColumns(
                fields,
                resultsColumns,
            );

        dispatch(
            setResults({
                results: resultsData,
                columnNames: resultsColumns,
                columns: vizColumns,
            }),
        );
    }, [dispatch, resultsData, resultsColumns, fields]);

    useEffect(() => {
        const resultsRunner = new SemanticViewerResultsRunnerFrontend({
            rows: results,
            columnNames,
            projectUuid,
            fields,
        });

        const chartResultOptions = getChartConfigAndOptions(
            resultsRunner,
            activeChartKind ?? ChartKind.TABLE,
            currentVizConfig,
        );

        dispatch(setChartOptionsAndConfig(chartResultOptions));
    }, [
        activeChartKind,
        currentVizConfig,
        dispatch,
        projectUuid,
        results,
        semanticQuery,
        fields,
        columnNames,
        org.data,
    ]);

    const handleRunSemanticLayerQuery = useCallback(async () => {
        await runSemanticViewerQuery();
        setHasClickedRunQueryButton(true);
    }, [runSemanticViewerQuery]);

    const handleSortField = useCallback(
        (fieldName: string) => {
            const fieldToUpdate = fields.find((f) => f.name === fieldName);

            if (fieldToUpdate) {
                dispatch(updateSortBy(fieldToUpdate));
            }
        },
        [dispatch, fields],
    );

    return (
        <>
            <Group
                h="4xl"
                pl="sm"
                pr="md"
                bg="gray.1"
                sx={(theme) => ({
                    borderBottom: `1px solid ${theme.colors.gray[3]}`,
                    flexShrink: 0,
                })}
            >
                <SegmentedControl
                    styles={(theme) => ({
                        root: {
                            backgroundColor: theme.colors.gray[2],
                        },
                    })}
                    size="sm"
                    radius="md"
                    data={[
                        {
                            value: EditorTabs.QUERY,
                            label: (
                                <Group spacing="xs" noWrap>
                                    <MantineIcon icon={IconCodeCircle} />
                                    <Text>Query</Text>
                                </Group>
                            ),
                        },
                        {
                            value: EditorTabs.VIZ,
                            label: (
                                <Group spacing="xs" noWrap>
                                    <MantineIcon icon={IconChartHistogram} />
                                    <Text>Chart</Text>
                                </Group>
                            ),
                        },
                    ]}
                    disabled={
                        allSelectedFieldNames.length === 0 ||
                        results.length === 0
                    }
                    value={activeEditorTab}
                    onChange={(value: EditorTabs) => {
                        dispatch(setActiveEditorTab(value));
                    }}
                />

                {!!semanticLayerView && <Filters />}

                <RunSemanticQueryButton
                    ml="auto"
                    onClick={handleRunSemanticLayerQuery}
                    isLoading={isRunningSemanticLayerQuery}
                    maxQueryLimit={config.maxQueryLimit}
                />
            </Group>

            {!semanticLayerView ? (
                <Center sx={{ flexGrow: 1 }}>
                    <SuboptimalState
                        title="Select a view"
                        description="Please select a view from the sidebar to start building a query"
                    />
                </Center>
            ) : allSelectedFieldNames.length === 0 ? (
                <Center sx={{ flexGrow: 1 }}>
                    <SuboptimalState
                        title="Select a field"
                        description="Please select a field from the sidebar to start building a query"
                    />
                </Center>
            ) : activeEditorTab === EditorTabs.QUERY ? (
                <ContentResults
                    onTableHeaderClick={handleSortField}
                    resultsError={requestDataError ?? undefined}
                />
            ) : activeEditorTab === EditorTabs.VIZ ? (
                <ContentCharts onTableHeaderClick={handleSortField} />
            ) : null}
        </>
    );
};

export default Content;
