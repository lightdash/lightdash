import { subject } from '@casl/ability';
import { type ResultColumn } from '@lightdash/common';
import { ActionIcon, Menu } from '@mantine/core';
import {
    IconDeviceFloppy,
    IconDots,
    IconDownload,
    IconTerminal2,
} from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { SaveSqlChartModalContent } from '../../../../../features/sqlRunner/components/SaveSqlChartModal';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import useCreateInAnySpaceAccess from '../../../../../hooks/user/useCreateInAnySpaceAccess';
import useApp from '../../../../../providers/App/useApp';
import { useUpdateArtifactVersionSavedSql } from '../../hooks/useProjectAiAgents';
import { AiArtifactTableVisualization } from './AiArtifactTableVisualization';
import { getAiArtifactTableConfig } from './AiArtifactTableVisualization.utils';
import { AiSqlArtifactDownloadModal } from './AiSqlArtifactDownloadModal';

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
    return (
        <AiArtifactTableVisualization
            results={results}
            headerContent={headerContent}
            loadingMessage="Loading SQL results..."
        />
    );
};
