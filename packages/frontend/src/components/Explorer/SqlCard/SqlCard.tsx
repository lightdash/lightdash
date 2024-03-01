import { subject } from '@casl/ability';
import { FC, memo } from 'react';
import { useApp } from '../../../providers/AppProvider';
import {
    ExplorerSection,
    useExplorerContext,
} from '../../../providers/ExplorerProvider';
import { Can } from '../../common/Authorization';
import CollapsableCard from '../../common/CollapsableCard';
import RenderCustomSql from '../../RenderedCustomSql';
import EditCustomSqlQuery from './EditCustomSqlQueryButton';
import OpenAsCustomSqlQueryButton from './OpenAsCustomSqlQueryButton';

interface SqlCardProps {
    projectUuid: string;
}

const SqlCard: FC<SqlCardProps> = memo(({ projectUuid }) => {
    const expandedSections = useExplorerContext(
        (c) => c.state.expandedSections,
    );
    const hasTableName = useExplorerContext(
        (c) => !!c.state.unsavedChartVersion.tableName,
    );
    const hasCustomExplore = useExplorerContext((c) => !!c.state.customExplore);
    const toggleExpandedSection = useExplorerContext(
        (c) => c.actions.toggleExpandedSection,
    );
    const { user } = useApp();

    const sqlIsOpen = expandedSections.includes(ExplorerSection.SQL);

    return (
        <CollapsableCard
            title="SQL"
            isOpen={sqlIsOpen}
            onToggle={() => toggleExpandedSection(ExplorerSection.SQL)}
            disabled={!hasTableName && !hasCustomExplore}
            rightHeaderElement={
                sqlIsOpen && (
                    <Can
                        I="manage"
                        this={subject('SqlRunner', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid,
                        })}
                    >
                        {hasCustomExplore && (
                            <EditCustomSqlQuery projectUuid={projectUuid} />
                        )}

                        <OpenAsCustomSqlQueryButton projectUuid={projectUuid} />
                    </Can>
                )
            }
        >
            <RenderCustomSql />
        </CollapsableCard>
    );
});

export default SqlCard;
