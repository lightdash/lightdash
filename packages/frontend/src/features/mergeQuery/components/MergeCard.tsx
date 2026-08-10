import { memo, type FC } from 'react';
import CollapsableCard from '../../../components/common/CollapsableCard/CollapsableCard';
import { useExplorerQuery } from '../../../hooks/useExplorerQuery';
import { ExplorerSection } from '../../../providers/Explorer/types';
import {
    explorerActions,
    selectIsMergeExpanded,
    selectMetricQuery,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../explorer/store';
import { MergePanel } from './MergePanel';

/**
 * Explorer card for merging the current query with a second one (#295).
 */
export const MergeCard: FC = memo(() => {
    const tableName = useExplorerSelector(selectTableName);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const isOpen = useExplorerSelector(selectIsMergeExpanded);
    const dispatch = useExplorerDispatch();
    const { queryResults } = useExplorerQuery();

    return (
        <CollapsableCard
            title="Merge"
            isOpen={isOpen}
            onToggle={() =>
                dispatch(
                    explorerActions.toggleExpandedSection(
                        ExplorerSection.MERGE,
                    ),
                )
            }
            disabled={!tableName}
        >
            {isOpen && !!tableName && (
                <MergePanel
                    tableName={tableName}
                    metricQuery={metricQuery}
                    rows={queryResults.rows ?? []}
                />
            )}
        </CollapsableCard>
    );
});
