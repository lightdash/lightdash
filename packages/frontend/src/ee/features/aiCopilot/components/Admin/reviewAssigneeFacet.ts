import { type FilterFacetOption } from '../../../../../components/common/FilterFacet';

// Sentinel facet value for items with no assignee.
export const UNASSIGNED_FILTER_VALUE = '__unassigned__';

export type AssigneeFacetUser = {
    firstName: string;
    lastName: string;
    email: string;
};

export type AssigneeFacetItem = {
    assignedToUserUuid: string | null;
};

const displayName = (user: AssigneeFacetUser): string =>
    `${user.firstName} ${user.lastName}`.trim() || user.email;

/**
 * Builds assignee filter options, current user first then by count, with a
 * trailing "Unassigned" bucket. Names resolve from the org-user superset so a
 * cross-project board still labels every assignee.
 */
export const buildAssigneeFacetOptions = ({
    items,
    usersByUuid,
    currentUserUuid,
}: {
    items: ReadonlyArray<AssigneeFacetItem>;
    usersByUuid: ReadonlyMap<string, AssigneeFacetUser>;
    currentUserUuid: string | null;
}): FilterFacetOption[] => {
    const counts = new Map<string, number>();
    let unassigned = 0;
    for (const item of items) {
        if (item.assignedToUserUuid) {
            counts.set(
                item.assignedToUserUuid,
                (counts.get(item.assignedToUserUuid) ?? 0) + 1,
            );
        } else {
            unassigned += 1;
        }
    }

    const nameFor = (uuid: string): string => {
        const user = usersByUuid.get(uuid);
        return user ? displayName(user) : 'Unknown user';
    };

    const options: FilterFacetOption[] = Array.from(counts.entries())
        .map(([uuid, count]) => ({
            uuid,
            count,
            name: nameFor(uuid),
            isCurrentUser: uuid === currentUserUuid,
        }))
        .sort((a, b) => {
            if (a.isCurrentUser) return -1;
            if (b.isCurrentUser) return 1;
            return b.count - a.count || a.name.localeCompare(b.name);
        })
        .map(({ uuid, count, name, isCurrentUser }) => ({
            value: uuid,
            label: isCurrentUser ? `${name} (you)` : name,
            count,
        }));

    if (unassigned > 0) {
        options.push({
            value: UNASSIGNED_FILTER_VALUE,
            label: 'Unassigned',
            count: unassigned,
        });
    }

    return options;
};

export const matchesAssigneeFilter = (
    item: AssigneeFacetItem,
    selectedAssignees: ReadonlyArray<string>,
): boolean => {
    if (selectedAssignees.length === 0) return true;
    return selectedAssignees.includes(
        item.assignedToUserUuid ?? UNASSIGNED_FILTER_VALUE,
    );
};
