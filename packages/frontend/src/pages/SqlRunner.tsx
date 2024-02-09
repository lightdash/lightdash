import { subject } from '@casl/ability';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    ScrollArea,
    Stack,
    Tabs,
    Text,
} from '@mantine/core';
import { getHotkeyHandler } from '@mantine/hooks';
import { IconTableShortcut, IconTelescope, IconX } from '@tabler/icons-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMount } from 'react-use';

import {
    ApiSqlQueryResults,
    CompiledDimension,
    FieldType,
    friendlyName,
} from '@lightdash/common';
import CollapsableCard from '../components/common/CollapsableCard';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import ShareShortLinkButton from '../components/common/ShareShortLinkButton';
import CatalogTree from '../components/common/SqlRunner/CatalogTree';
import ForbiddenPanel from '../components/ForbiddenPanel';
import RunSqlQueryButton from '../components/SqlRunner/RunSqlQueryButton';
import SqlRunnerLoadingSkeleton from '../components/SqlRunner/SqlRunerLoadingSkeleton';
import SqlRunnerInput from '../components/SqlRunner/SqlRunnerInput';
import SqlRunnerResultsTable, {
    ResultsIdleState,
} from '../components/SqlRunner/SqlRunnerResultsTable';
import { useProjectCatalog } from '../hooks/useProjectCatalog';
import {
    ProjectCatalogTreeNode,
    useProjectCatalogTree,
} from '../hooks/useProjectCatalogTree';
import { useSqlQueryMutation } from '../hooks/useSqlQuery';
import {
    useSqlRunnerRoute,
    useSqlRunnerUrlState,
} from '../hooks/useSqlRunnerRoute';
import { useApp } from '../providers/AppProvider';
import { TrackSection } from '../providers/TrackingProvider';
import { SectionName } from '../types/Events';

const generateBasicSqlQuery = (table: string, limit: number = 25) =>
    `SELECT *
     FROM ${table}
     LIMIT ${limit}`;

enum SqlRunnerCards {
    CHART = 'CHART',
    SQL = 'SQL',
    RESULTS = 'RESULTS',
}

type RunResult = ApiSqlQueryResults & {
    fieldsMap: Record<string, CompiledDimension>;
};

const SqlRunnerPage = () => {
    const { user, health } = useApp();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const initialState = useSqlRunnerUrlState();
    const [activeTab, setActiveTab] = useState<string | null>(null);
    const [runs, setRuns] = useState<RunResult[]>([]);
    const [activeTableInfo, setActiveTableInfo] = useState<{
        tableName: string;
        sqlTable: string;
    }>();
    const appendRun = (run: ApiSqlQueryResults) => {
        const fieldsMap: Record<string, CompiledDimension> = Object.fromEntries(
            Object.entries(run.fields).map(([key, type]) => {
                const dimension: CompiledDimension = {
                    fieldType: FieldType.DIMENSION,
                    type: type.type,
                    name: key,
                    label: friendlyName(key),
                    table: `hack${run.sqlRunUuid}`,
                    tableLabel: '',
                    sql: '',
                    compiledSql: '',
                    tablesReferences: [`hack${run.sqlRunUuid}`],
                    hidden: false,
                };
                return [`hack${run.sqlRunUuid}_${key}`, dimension];
            }),
        );
        setRuns((prev) => [{ ...run, fieldsMap }, ...prev]);
        setActiveTab(run.sqlRunUuid);
    };

    const getExploreOnClick = (runUuid: string) => {
        return () => {
            window
                .open(
                    `/projects/${projectUuid}/tables/hack${runUuid}`,
                    '_blank',
                )
                ?.focus();
        };
    };
    // open in new tab

    const sqlQueryMutation = useSqlQueryMutation(appendRun);
    const { isInitialLoading: isCatalogLoading, data: catalogData } =
        useProjectCatalog();

    const [sql, setSql] = useState<string>(initialState?.sqlRunner?.sql || '');
    const [lastSqlRan, setLastSqlRan] = useState<string>();

    const [expandedCards, setExpandedCards] = useState(
        new Map([
            [SqlRunnerCards.CHART, false],
            [SqlRunnerCards.SQL, true],
            [SqlRunnerCards.RESULTS, true],
        ]),
    );

    const handleCardExpand = (card: SqlRunnerCards, value: boolean) => {
        setExpandedCards((prev) => new Map(prev).set(card, value));
    };

    const { isLoading, mutate } = sqlQueryMutation;

    const sqlRunnerState = useMemo(
        () => ({
            sqlRunner: lastSqlRan ? { sql: lastSqlRan } : undefined,
        }),
        [lastSqlRan],
    );

    useSqlRunnerRoute(sqlRunnerState);

    const handleSubmit = useCallback(() => {
        if (!sql) return;

        mutate(sql);
        setLastSqlRan(sql);
    }, [mutate, sql]);

    useMount(() => {
        handleSubmit();
    });

    useEffect(() => {
        const handler = getHotkeyHandler([['mod+Enter', handleSubmit]]);
        document.body.addEventListener('keydown', handler);
        return () => document.body.removeEventListener('keydown', handler);
    }, [handleSubmit]);

    useEffect(() => {
        if (runs.length > 0 && activeTab === null) {
            setActiveTab(runs[0].sqlRunUuid);
        }
    }, [runs, activeTab, setActiveTab]);

    const catalogTree = useProjectCatalogTree(catalogData);

    const handleTableSelect = useCallback(
        (node: ProjectCatalogTreeNode) => {
            if (!node.sqlTable) return;

            const query = generateBasicSqlQuery(node.sqlTable);

            setSql(query);
            handleCardExpand(SqlRunnerCards.SQL, true);
            setActiveTableInfo({
                tableName: node.label,
                sqlTable: node.sqlTable,
            });
        },
        [setSql],
    );

    const cannotManageSqlRunner = user.data?.ability?.cannot(
        'manage',
        subject('SqlRunner', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );
    const cannotViewProject = user.data?.ability?.cannot('view', 'Project');
    if (cannotManageSqlRunner || cannotViewProject) {
        return <ForbiddenPanel />;
    }

    if (health.isInitialLoading || !health.data) {
        return null;
    }

    // use date js to format Date object as HH:mm:ss
    const formatDate = (date: Date | string) => {
        return new Date(date).toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    };

    const handleDeleteTab = (tab: string) => {
        setRuns((prev) => prev.filter((run) => run.sqlRunUuid !== tab));
        setActiveTab(null);
    };

    const handleTablePreviewClick = (sqlTable: string) => {
        mutate(generateBasicSqlQuery(sqlTable, 10));
    };

    // @ts-ignore
    // @ts-ignore
    return (
        <Page
            title="SQL Runner"
            withSidebarFooter={false}
            withFullHeight
            withPaddedContent={false}
            sidebar={
                <Stack spacing="xl" sx={{ overflowY: 'hidden', flexGrow: 1 }}>
                    <PageBreadcrumbs
                        items={[{ title: 'SQL Runner', active: true }]}
                    />

                    {isCatalogLoading ? (
                        <SqlRunnerLoadingSkeleton />
                    ) : (
                        <>
                            <Box
                                sx={{
                                    overflowY: 'auto',
                                    flexGrow: 1,
                                }}
                            >
                                <CatalogTree
                                    nodes={catalogTree}
                                    onSelect={handleTableSelect}
                                    onTablePreviewClick={(sqlTable) => {
                                        handleTablePreviewClick(sqlTable);
                                    }}
                                />
                            </Box>
                            {activeTableInfo && (
                                <ScrollArea
                                    sx={{
                                        flexGrow: 0,
                                        flexShrink: 0,
                                        flexBasis: 300,
                                    }}
                                >
                                    <Stack>
                                        <Group position="apart">
                                            <Text fw={700}>
                                                {friendlyName(
                                                    activeTableInfo.tableName,
                                                )}
                                            </Text>
                                            <Group position="right">
                                                <Text>100 Rows</Text>
                                                <ActionIcon
                                                    size={'xs'}
                                                    variant={'subtle'}
                                                    color={'gray.9'}
                                                    onClick={() => {
                                                        handleTablePreviewClick(
                                                            activeTableInfo.sqlTable,
                                                        );
                                                    }}
                                                >
                                                    <MantineIcon
                                                        icon={IconTableShortcut}
                                                    />
                                                </ActionIcon>
                                            </Group>
                                        </Group>
                                        <Group
                                            sx={{ paddingLeft: '10px' }}
                                            position={'apart'}
                                        >
                                            <Text>Column1</Text>
                                            <Text>INT</Text>
                                        </Group>
                                    </Stack>
                                </ScrollArea>
                            )}
                        </>
                    )}
                </Stack>
            }
        >
            <Stack spacing={'5px'} sx={{ marginLeft: '3px' }}>
                <TrackSection name={SectionName.EXPLORER_TOP_BUTTONS}>
                    <Group position="right">
                        <Group spacing="sm">
                            <RunSqlQueryButton
                                onSubmit={handleSubmit}
                                isLoading={isLoading}
                            />
                            <ShareShortLinkButton
                                disabled={lastSqlRan === undefined}
                            />
                        </Group>
                    </Group>
                </TrackSection>

                <SqlRunnerInput
                    sql={sql}
                    onChange={setSql}
                    projectCatalog={catalogData}
                    isDisabled={isLoading}
                />
                {runs.length === 0 && (
                    <ResultsIdleState
                        onSubmit={handleSubmit}
                        isLoading={false}
                    />
                )}
                {runs.length > 0 && (
                    <Tabs
                        radius="md"
                        keepMounted={false}
                        value={activeTab}
                        onTabChange={setActiveTab}
                    >
                        <Tabs.List>
                            {runs.map((run, index) => (
                                <Tabs.Tab
                                    key={run.sqlRunUuid}
                                    value={run.sqlRunUuid}
                                    rightSection={
                                        index !== 0 && (
                                            <ActionIcon
                                                onClick={() =>
                                                    handleDeleteTab(
                                                        run.sqlRunUuid,
                                                    )
                                                }
                                            >
                                                <MantineIcon icon={IconX} />
                                            </ActionIcon>
                                        )
                                    }
                                >
                                    {index === 0 ? (
                                        <b>Results</b>
                                    ) : (
                                        formatDate(run.createdAt)
                                    )}
                                </Tabs.Tab>
                            ))}
                        </Tabs.List>
                        {runs.map((run) => (
                            <Tabs.Panel
                                value={run.sqlRunUuid}
                                key={run.sqlRunUuid}
                            >
                                <CollapsableCard
                                    title=""
                                    isOpen={expandedCards.get(
                                        SqlRunnerCards.RESULTS,
                                    )}
                                    onToggle={(value) =>
                                        handleCardExpand(
                                            SqlRunnerCards.RESULTS,
                                            value,
                                        )
                                    }
                                    rightHeaderElement={
                                        <Button
                                            component="a"
                                            size="xs"
                                            leftIcon={
                                                <MantineIcon
                                                    icon={IconTelescope}
                                                />
                                            }
                                            onClick={getExploreOnClick(
                                                run.sqlRunUuid,
                                            )}
                                        >
                                            Explore from here
                                        </Button>
                                    }
                                >
                                    <Tabs
                                        defaultValue="results"
                                        variant="pills"
                                        radius="xl"
                                    >
                                        <Stack align="stretch" justify="center">
                                            <Tabs.List position={'center'}>
                                                <Tabs.Tab
                                                    value="results"
                                                    color="gray"
                                                >
                                                    Results
                                                </Tabs.Tab>
                                                <Tabs.Tab
                                                    value="sql"
                                                    color="gray"
                                                >
                                                    SQL
                                                </Tabs.Tab>
                                            </Tabs.List>
                                        </Stack>
                                        <Tabs.Panel value={'results'}>
                                            <SqlRunnerResultsTable
                                                sqlRunUuid={run.sqlRunUuid}
                                                onSubmit={handleSubmit}
                                                rows={run.rows}
                                                fieldsMap={run.fieldsMap}
                                                sqlQueryMutation={
                                                    sqlQueryMutation
                                                }
                                            />
                                        </Tabs.Panel>
                                        <Tabs.Panel value={'sql'}>
                                            <SqlRunnerInput
                                                sql={run.sql}
                                                isDisabled={true}
                                                onChange={() => {}}
                                                projectCatalog={undefined}
                                            />
                                        </Tabs.Panel>
                                    </Tabs>
                                </CollapsableCard>
                            </Tabs.Panel>
                        ))}
                    </Tabs>
                )}
            </Stack>
        </Page>
    );
};
export default SqlRunnerPage;
