import intersection from 'lodash/intersection';
import { type Explore } from '../../types/explore';

export function filterExploreByTags({
    explore,
    availableTags,
}: {
    explore: Explore;
    availableTags: string[] | null;
}) {
    if (!availableTags) {
        return explore;
    }

    const baseTable = explore.tables[explore.baseTable];
    if (!baseTable) {
        throw new Error(`Base table not found`);
    }

    if (intersection(explore.tags, availableTags).length > 0) {
        return explore;
    }

    return undefined;
}
