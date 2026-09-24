import { subject } from '@casl/ability';
import {
    getComposerVizPlan,
    type ComposerVizKind,
    type ResultColumn,
} from '@lightdash/common';
import { ActionIcon, Box, Menu } from '@mantine/core';
import {
    IconDeviceFloppy,
    IconDots,
    IconDownload,
    IconTerminal2,
} from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useMemo, useState, type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { SaveSqlChartModalContent } from '../../../../../features/sqlRunner/components/SaveSqlChartModal';
import { type SqlRunnerConnectionRequest } from '../../../../../features/sqlRunner/store/sqlRunnerSlice';

const NO_CONNECTION_FIELD: SqlRunnerConnectionRequest = {
    ready: true,
    field: {},
};
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import useCreateInAnySpaceAccess from '../../../../../hooks/user/useCreateInAnySpaceAccess';
import useApp from '../../../../../providers/App/useApp';
import { useUpdateArtifactVersionSavedSql } from '../../hooks/useProjectAiAgents';
import { AgentVisualizationChartTypeSwitcher } from './AgentVisualizationChartTypeSwitcher';
import styles from './AiArtifactPanel.module.css';
import { AiArtifactTableVisualization } from './AiArtifactTableVisualization';
import { getAiArtifactTableConfig } from './AiArtifactTableVisualization.utils';
import { AiComposerChartVisualization } from './AiComposerChartVisualization';
import { AiSqlArtifactDownloadModal } from './AiSqlArtifactDownloadModal';
import { useArtifactResultRows } from './useArtifactResultRows';

const LOADING_MESSAGE = 'Loading SQL results...';

type ContentProps = {
    projectUuid: string;
    results: InfiniteQueryResults;
    headerContent: ReactNode;
    flush?: boolean;
};

type ActionsProps = {
    projectUuid: string;
    agentUuid: string;
    artifactUuid: string;
    versionUuid: string;
    savedSqlUuid: string | null;
    sql: string;
    limit: number;
    queryUuid: string;
    totalResults: number;
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
    queryUuid,
    totalResults,
    title,
    description,
    columns,
}) => {
    const { user } = useApp();
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
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
                        color="ldGray.9"
                        aria-label="SQL artifact actions"
                    >
                        <MantineIcon icon={IconDots} size="lg" />
                    </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Label>Quick actions</Menu.Label>
                    <Menu.Item
                        onClick={() => setIsDownloadModalOpen(true)}
                        leftSection={<MantineIcon icon={IconDownload} />}
                    >
                        Download results
                    </Menu.Item>
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
            <AiSqlArtifactDownloadModal
                opened={isDownloadModalOpen}
                onClose={() => setIsDownloadModalOpen(false)}
                projectUuid={projectUuid}
                queryUuid={queryUuid}
                sql={sql}
                chartName={title}
                totalResults={totalResults}
                columnOrder={columns.map((column) => column.reference)}
            />
            <SaveSqlChartModalContent
                key={`${isSaveModalOpen}-saveSqlArtifact`}
                opened={isSaveModalOpen}
                onClose={() => setIsSaveModalOpen(false)}
                projectUuid={projectUuid}
                name={title}
                description={description}
                sql={sql}
                limit={limit}
                currentVizConfig={getAiArtifactTableConfig(columns)}
                hasUnrunChanges={false}
                connectionRequest={NO_CONNECTION_FIELD}
                redirectOnSuccess={false}
                onSaved={async ({ savedSqlUuid: newSavedSqlUuid }) => {
                    await linkSavedSql({ savedSqlUuid: newSavedSqlUuid });
                }}
            />
        </>
    );
};

/**
 * A SQL answer renders like a composer node result: the same default-viz
 * rule over its columns, the same switcher, charts from the fetched rows.
 */
export const AiSqlArtifactVisualization: FC<ContentProps> = ({
    projectUuid,
    results,
    headerContent,
    flush = false,
}) => {
    const { columns, rows } = useArtifactResultRows(results);
    const plan = useMemo(
        () => getComposerVizPlan({ columns, rows, node: null }),
        [columns, rows],
    );
    const [chosenKind, setChosenKind] = useState<ComposerVizKind | null>(null);
    const kind =
        chosenKind && plan.availableKinds.includes(chosenKind)
            ? chosenKind
            : plan.defaultKind;
    const axes = kind === 'table' ? undefined : plan.axes[kind];
    const showPill = plan.availableKinds.length > 1;

    return (
        <Box className={styles.displayedResult}>
            <Box
                className={clsx(
                    styles.displayedResultBody,
                    showPill && styles.withPillClearance,
                )}
            >
                {kind !== 'table' && axes ? (
                    <AiComposerChartVisualization
                        projectUuid={projectUuid}
                        results={results}
                        kind={kind}
                        axes={axes}
                        headerContent={headerContent}
                        loadingMessage={LOADING_MESSAGE}
                    />
                ) : (
                    <AiArtifactTableVisualization
                        results={results}
                        headerContent={headerContent}
                        flush={flush}
                        loadingMessage={LOADING_MESSAGE}
                    />
                )}
            </Box>
            {showPill && (
                <Box className={styles.floatingPill}>
                    <AgentVisualizationChartTypeSwitcher
                        availableChartTypes={plan.availableKinds}
                        selectedChartType={kind}
                        onChartTypeChange={setChosenKind}
                        variant="pill"
                    />
                </Box>
            )}
        </Box>
    );
};
