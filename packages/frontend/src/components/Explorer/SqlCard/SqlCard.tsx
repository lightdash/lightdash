import { subject } from '@casl/ability';
import { ActionIcon, CopyButton, Tooltip } from '@mantine/core';
import { IconCheck, IconClipboard } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import { useCompiledSql } from '../../../hooks/useCompiledSql';
import { useApp } from '../../../providers/AppProvider';
import {
    ExplorerSection,
    useExplorerContext,
} from '../../../providers/ExplorerProvider';
import { Can } from '../../common/Authorization';
import CollapsableCard from '../../common/CollapsableCard';
import { RenderedSql } from '../../RenderedSql';
import OpenInSqlRunnerButton from './OpenInSqlRunnerButton';

interface SqlCardProps {
    projectUuid: string;
}

const SqlCard: FC<SqlCardProps> = memo(({ projectUuid }) => {
    const expandedSections = useExplorerContext(
        (context) => context.state.expandedSections,
    );
    const unsavedChartVersionTableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const toggleExpandedSection = useExplorerContext(
        (context) => context.actions.toggleExpandedSection,
    );
    const { user } = useApp();

    const { data: sql } = useCompiledSql();

    const sqlIsOpen = expandedSections.includes(ExplorerSection.SQL);
    return (
        <CollapsableCard
            title="SQL"
            isOpen={sqlIsOpen}
            onToggle={() => toggleExpandedSection(ExplorerSection.SQL)}
            disabled={!unsavedChartVersionTableName}
            rightHeaderElement={
                sqlIsOpen ? (
                    <Can
                        I="manage"
                        this={subject('SqlRunner', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid,
                        })}
                    >
                        <OpenInSqlRunnerButton projectUuid={projectUuid} />
                    </Can>
                ) : (
                    <CopyButton value={sql || ''} timeout={2000}>
                        {({ copied, copy }) => (
                            <Tooltip
                                label={copied ? 'Copied to clipboard!' : 'Copy'}
                                withArrow
                                position="right"
                                color={copied ? 'green' : 'dark'}
                            >
                                <ActionIcon
                                    color={copied ? 'teal' : 'gray'}
                                    onClick={copy}
                                >
                                    {copied ? (
                                        <IconCheck size="1rem" />
                                    ) : (
                                        <IconClipboard size="1rem" />
                                    )}
                                </ActionIcon>
                            </Tooltip>
                        )}
                    </CopyButton>
                )
            }
        >
            <RenderedSql />
        </CollapsableCard>
    );
});

export default SqlCard;
