import { subject } from '@casl/ability';
import {
    ChartKind,
    type RawResultRow,
    type ResultColumn,
    type ResultRow,
    type VizTableConfig,
} from '@lightdash/common';
import {
    ActionIcon,
    Center,
    Loader,
    Menu,
    Paper,
    Stack,
} from '@mantine-8/core';
import { IconDeviceFloppy, IconDots, IconTerminal2 } from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { ChartDataTable } from '../../../../../components/DataViz/visualizations/ChartDataTable';
import { SaveSqlChartModalContent } from '../../../../../features/sqlRunner/components/SaveSqlChartModal';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import useCreateInAnySpaceAccess from '../../../../../hooks/user/useCreateInAnySpaceAccess';
import useApp from '../../../../../providers/App/useApp';
import { useUpdateArtifactVersionSavedSql } from '../../hooks/useProjectAiAgents';

const unwrapRows = (rows: ResultRow[]): RawResultRow[] =>
    rows.map((row) =>
        Object.fromEntries(
            Object.entries(row).map(([key, value]) => [key, value.value.raw]),
        ),
    );

const getTableConfig = (columns: ResultColumn[]): VizTableConfig => ({
    metadata: { version: 1 },
    type: ChartKind.TABLE,
    columns: Object.fromEntries(
        columns.map((column) => [
            column.reference,
            {
                visible: true,
                reference: column.reference,
                label: column.reference,
                frozen: false,
            },
        ]),
    ),
    display: undefined,
});

type ContentProps = {
    results: InfiniteQueryResults;
    headerContent: ReactNode;
};

type ActionsProps = {
    projectUuid: string;
    agentUuid: string;
    artifactUuid: string;
    versionUuid: string;
    savedSqlUuid: string | null;
    sql: string;
    limit: number;
    title: string;
    description: string | null;
    columns: ResultColumn[];
};

export const AiSqlArtifactActions: FC<ActionsProps> = ({
    projectUuid,
    agentUuid,
    artifactUuid,
    versionUuid,
    savedSqlUuid,
    sql,
    limit,
    title,
    description,
    columns,
}) => {
    const { user } = useApp();
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const { mutateAsync: linkSavedSql } = useUpdateArtifactVersionSavedSql(
        projectUuid,
        agentUuid,
        artifactUuid,
        versionUuid,
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

    return (
        <>
            <Menu withArrow position="bottom-end">
                <Menu.Target>
                    <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="ldGray.9"
                        aria-label="SQL artifact actions"
                    >
                        <MantineIcon icon={IconDots} size="lg" />
                    </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Label>Quick actions</Menu.Label>
                    <Menu.Item
                        component={Link}
                        to={{
                            pathname: `/projects/${projectUuid}/sql-runner`,
                        }}
                        state={{ sql, limit }}
                        leftSection={<MantineIcon icon={IconTerminal2} />}
                    >
                        Continue exploring in SQL Runner
                    </Menu.Item>
                    <Menu.Item
                        disabled={!canSave || columns.length === 0}
                        onClick={() => setIsSaveModalOpen(true)}
                        leftSection={<MantineIcon icon={IconDeviceFloppy} />}
                    >
                        {savedSqlUuid ? 'Save another copy' : 'Save'}
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
            <SaveSqlChartModalContent
                key={`${isSaveModalOpen}-saveSqlArtifact`}
                opened={isSaveModalOpen}
                onClose={() => setIsSaveModalOpen(false)}
                projectUuid={projectUuid}
                name={title}
                description={description}
                sql={sql}
                limit={limit}
                currentVizConfig={getTableConfig(columns)}
                hasUnrunChanges={false}
                redirectOnSuccess={false}
                onSaved={async ({ savedSqlUuid: newSavedSqlUuid }) => {
                    await linkSavedSql({ savedSqlUuid: newSavedSqlUuid });
                }}
            />
        </>
    );
};

export const AiSqlArtifactVisualization: FC<ContentProps> = ({
    results,
    headerContent,
}) => {
    const columns = useMemo(
        () => Object.values(results.columns ?? {}),
        [results.columns],
    );
    const columnNames = useMemo(
        () => columns.map((column) => column.reference),
        [columns],
    );
    const rows = useMemo(() => unwrapRows(results.rows), [results.rows]);

    useEffect(() => {
        if (!results.hasFetchedAllRows && !results.fetchAll) {
            results.setFetchAll(true);
        }
    }, [results]);

    if (
        results.isInitialLoading ||
        results.isFetchingFirstPage ||
        columns.length === 0
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
                <ChartDataTable
                    columnNames={columnNames}
                    rows={rows}
                    columnsConfig={getTableConfig(columns).columns}
                    flexProps={{ mah: '100%' }}
                />
            </Paper>
        </Stack>
    );
};
