import { subject } from '@casl/ability';
import {
    ChartKind,
    isVizTableConfig,
    type ApiAiAgentSqlArtifactVizQuery,
    type RawResultRow,
    type ResultRow,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Center,
    Loader,
    Paper,
    Stack,
    Tooltip,
} from '@mantine-8/core';
import { IconDeviceFloppy, IconTerminal2 } from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FC, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { resetChartState } from '../../../../../components/DataViz/store/actions/commonChartActions';
import { selectCompleteConfigByKind } from '../../../../../components/DataViz/store/selectors';
import { Table } from '../../../../../components/DataViz/visualizations/Table';
import { SaveSqlChartModal } from '../../../../../features/sqlRunner/components/SaveSqlChartModal';
import { store, type RootState } from '../../../../../features/sqlRunner/store';
import {
    useAppDispatch,
    useAppSelector,
} from '../../../../../features/sqlRunner/store/hooks';
import {
    hydrateSqlQueryResults,
    resetState,
    selectSqlRunnerResultsRunner,
    setSelectedChartType,
    updateName,
} from '../../../../../features/sqlRunner/store/sqlRunnerSlice';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import useCreateInAnySpaceAccess from '../../../../../hooks/user/useCreateInAnySpaceAccess';
import useApp from '../../../../../providers/App/useApp';

const unwrapRows = (rows: ResultRow[]): RawResultRow[] =>
    rows.map((row) =>
        Object.fromEntries(
            Object.entries(row).map(([key, value]) => [key, value.value.raw]),
        ),
    );

type ContentProps = {
    projectUuid: string;
    vizQueryData: ApiAiAgentSqlArtifactVizQuery;
    results: InfiniteQueryResults;
    headerContent: ReactNode;
};

type ActionsProps = {
    projectUuid: string;
    sql: string;
    limit: number;
};

export const AiSqlArtifactActions: FC<ActionsProps> = ({
    projectUuid,
    sql,
    limit,
}) => {
    const { user } = useApp();
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const hasLoadedColumns = useAppSelector(
        (state) => state.sqlRunner.sqlColumns !== undefined,
    );
    const canManageCustomSql = !!user.data?.ability.can(
        'manage',
        subject('CustomSql', {
            organizationUuid: user.data.organizationUuid,
            projectUuid,
        }),
    );
    const canCreateChartInSpace = useCreateInAnySpaceAccess(
        projectUuid,
        'SavedChart',
    );
    const canSave = canManageCustomSql && canCreateChartInSpace;
    const saveDisabled = !canSave || !hasLoadedColumns;

    return (
        <>
            <Button
                component={Link}
                to={{
                    pathname: `/projects/${projectUuid}/sql-runner`,
                }}
                state={{ sql, limit }}
                size="compact-xs"
                variant="default"
                leftSection={<MantineIcon icon={IconTerminal2} size={13} />}
            >
                Continue exploring in SQL Runner
            </Button>
            <Tooltip
                label={
                    canSave
                        ? 'Save SQL chart'
                        : "You don't have permission to save SQL charts"
                }
                position="bottom"
                withArrow
            >
                <Box component="span">
                    <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="ldGray.6"
                        disabled={saveDisabled}
                        onClick={() => setIsSaveModalOpen(true)}
                        aria-label="Save SQL chart"
                    >
                        <MantineIcon icon={IconDeviceFloppy} />
                    </ActionIcon>
                </Box>
            </Tooltip>
            <SaveSqlChartModal
                key={`${isSaveModalOpen}-saveSqlArtifact`}
                opened={isSaveModalOpen}
                onClose={() => setIsSaveModalOpen(false)}
            />
        </>
    );
};

const AiSqlArtifactVisualizationContent: FC<ContentProps> = ({
    projectUuid,
    vizQueryData,
    results,
    headerContent,
}) => {
    const dispatch = useAppDispatch();
    const columns = useMemo(
        () => Object.values(results.columns ?? {}),
        [results.columns],
    );
    const rows = useMemo(() => unwrapRows(results.rows), [results.rows]);

    useEffect(() => {
        dispatch(resetState());
        dispatch(resetChartState());
        dispatch(setSelectedChartType(ChartKind.TABLE));
        dispatch(
            updateName(vizQueryData.metadata.title ?? 'Untitled SQL query'),
        );

        return () => {
            dispatch(resetState());
            dispatch(resetChartState());
        };
    }, [dispatch, vizQueryData.metadata.title]);

    useEffect(() => {
        if (columns.length === 0) return;

        dispatch(
            hydrateSqlQueryResults({
                projectUuid,
                sql: vizQueryData.sql,
                limit: vizQueryData.limit,
                queryUuid: vizQueryData.queryUuid,
                fileUrl: undefined,
                columns,
                results: rows,
            }),
        );
    }, [columns, dispatch, projectUuid, rows, vizQueryData]);

    useEffect(() => {
        if (!results.hasFetchedAllRows && !results.fetchAll) {
            results.setFetchAll(true);
        }
    }, [results]);

    const resultsRunner = useAppSelector((state) =>
        selectSqlRunnerResultsRunner(state),
    );
    const tableConfig = useAppSelector((state) =>
        selectCompleteConfigByKind(state as RootState, ChartKind.TABLE),
    );

    if (
        results.isInitialLoading ||
        results.isFetchingFirstPage ||
        columns.length === 0 ||
        !isVizTableConfig(tableConfig)
    ) {
        return (
            <Center h={300}>
                <Loader
                    type="dots"
                    color="gray"
                    delayedMessage="Loading SQL results..."
                />
            </Center>
        );
    }

    return (
        <Stack gap="md" h="100%" mih={300}>
            {headerContent}
            <Paper
                flex={1}
                mih={0}
                pos="relative"
                withBorder
                radius="md"
                bg="ldGray.0"
                style={{ overflow: 'hidden' }}
            >
                <Table
                    resultsRunner={resultsRunner}
                    columnsConfig={tableConfig.columns}
                    flexProps={{ mah: '100%', h: '100%' }}
                />
            </Paper>
        </Stack>
    );
};

export const AiSqlArtifactVisualization: FC<ContentProps> = (props) => (
    <Provider store={store}>
        <AiSqlArtifactVisualizationContent {...props} />
    </Provider>
);
