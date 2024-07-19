import { subject } from '@casl/ability';
import { ActionIcon, CopyButton, Tooltip } from '@mantine/core';
import { useHover } from '@mantine/hooks';
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
import MantineIcon from '../../common/MantineIcon';
import { RenderedSql } from '../../RenderedSql';
import OpenInSqlRunnerButton from './OpenInSqlRunnerButton';

interface SqlCardProps {
    projectUuid: string;
}

const SqlCard: FC<SqlCardProps> = memo(({ projectUuid }) => {
    const { hovered, ref: headingRef } = useHover();
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

    const sqlIsOpen = expandedSections.includes(ExplorerSection.SQL);
    const { data, isSuccess } = useCompiledSql();
    return (
        <CollapsableCard
            headingRef={headingRef}
            title="SQL"
            isOpen={sqlIsOpen}
            onToggle={() => toggleExpandedSection(ExplorerSection.SQL)}
            disabled={!unsavedChartVersionTableName}
            headerElement={
                hovered && data && isSuccess && !sqlIsOpen ? (
                    <CopyButton value={data || ''} timeout={2000}>
                        {({ copied, copy }) => (
                            <Tooltip
                                variant="xs"
                                label={
                                    copied ? 'Copied to clipboard' : 'Copy SQL'
                                }
                                withArrow
                                position="right"
                                color={copied ? 'green' : 'dark'}
                                fw={500}
                            >
                                <ActionIcon
                                    color={copied ? 'teal' : 'gray'}
                                    onClick={copy}
                                >
                                    {
                                        <MantineIcon
                                            icon={
                                                copied
                                                    ? IconCheck
                                                    : IconClipboard
                                            }
                                        />
                                    }
                                </ActionIcon>
                            </Tooltip>
                        )}
                    </CopyButton>
                ) : undefined
            }
            rightHeaderElement={
                sqlIsOpen && (
                    <Can
                        I="manage"
                        this={subject('SqlRunner', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid,
                        })}
                    >
                        <OpenInSqlRunnerButton projectUuid={projectUuid} />
                    </Can>
                )
            }
        >
            <RenderedSql />
        </CollapsableCard>
    );
});

export default SqlCard;
