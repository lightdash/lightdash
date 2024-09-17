import { Center, Group, SegmentedControl, Text } from '@mantine/core';
import { IconChartHistogram, IconCodeCircle } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { setChartOptionsAndConfig } from '../../../components/DataViz/store/actions/commonChartActions';
import { selectChartConfigByKind } from '../../../components/DataViz/store/selectors';
import getChartConfigAndOptions from '../../../components/DataViz/transformers/getChartConfigAndOptions';
import useToaster from '../../../hooks/toaster/useToaster';
import { useSemanticLayerQueryResults } from '../api/hooks';
import { SemanticViewerResultsRunner } from '../runners/SemanticViewerResultsRunner';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
    selectAllSelectedFieldNames,
    selectAllSelectedFieldsByKind,
    selectSemanticLayerInfo,
    selectSemanticLayerQuery,
} from '../store/selectors';
import {
    EditorTabs,
    setActiveEditorTab,
    setResults,
    setShouldFetchResults,
} from '../store/semanticViewerSlice';
import ContentCharts from './ContentCharts';
import ContentResults from './ContentResults';
import Filters from './Filters';
import { RunSemanticQueryButton } from './RunSemanticQueryButton';

const Content: FC = () => {
    const dispatch = useAppDispatch();
    const { showToastError } = useToaster();

    const { projectUuid, config } = useAppSelector(selectSemanticLayerInfo);
    const semanticQuery = useAppSelector(selectSemanticLayerQuery);
    const allSelectedFieldNames = useAppSelector(selectAllSelectedFieldNames);
    const {
        results,
        view,
        activeEditorTab,
        columns,
        fields,
        activeChartKind,
        shouldFetchResults,
    } = useAppSelector((state) => state.semanticViewer);

    const currentVizConfig = useAppSelector((state) =>
        selectChartConfigByKind(state, activeChartKind),
    );

    const allSelectedFieldsByKind = useAppSelector(
        selectAllSelectedFieldsByKind,
    );

    const selectedFieldsCount =
        allSelectedFieldsByKind.dimensions.length +
        allSelectedFieldsByKind.metrics.length +
        allSelectedFieldsByKind.timeDimensions.length;

    const {
        data: requestData,
        mutateAsync: runSemanticViewerQuery,
        isLoading: isRunningSemanticLayerQuery,
    } = useSemanticLayerQueryResults(projectUuid, {
        onError: (data) => {
            showToastError({
                title: 'Could not fetch SQL query results',
                subtitle: data.error.message,
            });
        },
    });

    const resultsData = useMemo(() => requestData?.results, [requestData]);
    const resultsColumns = useMemo(() => requestData?.columns, [requestData]);

    useEffect(() => {
        if (!resultsColumns || !resultsData) return;

        const vizColumns =
            SemanticViewerResultsRunner.convertColumnsToVizColumns(
                fields,
                resultsColumns,
            );

        dispatch(setResults({ results: resultsData, columns: vizColumns }));
    }, [dispatch, resultsData, resultsColumns, fields]);

    useEffect(() => {
        const resultsRunner = new SemanticViewerResultsRunner({
            query: semanticQuery,
            rows: results,
            columns,
            projectUuid,
            fields,
        });

        const chartResultOptions = getChartConfigAndOptions(
            resultsRunner,
            activeChartKind,
            currentVizConfig,
        );

        dispatch(setChartOptionsAndConfig(chartResultOptions));
    }, [
        activeChartKind,
        columns,
        currentVizConfig,
        dispatch,
        projectUuid,
        results,
        semanticQuery,
        fields,
    ]);

    const runSemanticLayerQuery = useCallback(
        () => runSemanticViewerQuery(semanticQuery),
        [semanticQuery, runSemanticViewerQuery],
    );

    useEffect(() => {
        if (shouldFetchResults) {
            runSemanticLayerQuery().catch(console.error); // ! There's already a toast when this errors, just log to console
            dispatch(setShouldFetchResults(false));
        }
    }, [runSemanticLayerQuery, shouldFetchResults, dispatch]);

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

                {!!view && <Filters />}

                <RunSemanticQueryButton
                    ml="auto"
                    onClick={runSemanticLayerQuery}
                    isLoading={isRunningSemanticLayerQuery}
                    maxQueryLimit={config.maxQueryLimit}
                />
            </Group>
            {!view ? (
                <Center sx={{ flexGrow: 1 }}>
                    <SuboptimalState
                        title="Select a view"
                        description="Please select a view from the sidebar to start building a query"
                    />
                </Center>
            ) : selectedFieldsCount === 0 ? (
                <Center sx={{ flexGrow: 1 }}>
                    <SuboptimalState
                        title="Select a field"
                        description="Please select a field from the sidebar to start building a query"
                    />
                </Center>
            ) : activeEditorTab === EditorTabs.QUERY ? (
                <ContentResults />
            ) : activeEditorTab === EditorTabs.VIZ ? (
                <ContentCharts />
            ) : null}
        </>
    );
};

export default Content;
