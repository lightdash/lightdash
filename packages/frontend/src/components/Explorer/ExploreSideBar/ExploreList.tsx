import { type FC } from 'react';
import ExploreListEmptyState from './ExploreListEmptyState';
import VirtualizedExploreList, {
    type VirtualizedExploreListProps,
} from './VirtualizedExploreList';

/**
 * The explore list, or the reason it is empty. A connection filter that
 * matches nothing would otherwise leave the panel blank.
 */
const ExploreList: FC<
    VirtualizedExploreListProps & { emptyConnectionName?: string }
> = ({ emptyConnectionName, ...listProps }) =>
    emptyConnectionName === undefined ? (
        <VirtualizedExploreList {...listProps} />
    ) : (
        <ExploreListEmptyState
            connectionName={emptyConnectionName}
            isSearching={listProps.searchQuery !== ''}
        />
    );

export default ExploreList;
