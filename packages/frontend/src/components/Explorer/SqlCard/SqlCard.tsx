import { FC, memo } from 'react';
import {
    ExplorerSection,
    useExplorerContext,
} from '../../../providers/ExplorerProvider';
import CollapsableCard from '../../common/CollapsableCard';
import { RenderedSql } from '../../RenderedSql';

const SqlCard: FC = memo(() => {
    const expandedSections = useExplorerContext(
        (context) => context.state.expandedSections,
    );
    const unsavedChartVersionTableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const toggleExpandedSection = useExplorerContext(
        (context) => context.actions.toggleExpandedSection,
    );
    const sqlIsOpen = expandedSections.includes(ExplorerSection.SQL);
    return (
        <CollapsableCard
            title="SQL"
            isOpen={sqlIsOpen}
            onToggle={() => toggleExpandedSection(ExplorerSection.SQL)}
            disabled={!unsavedChartVersionTableName}
        >
            <RenderedSql />
        </CollapsableCard>
    );
});

export default SqlCard;
