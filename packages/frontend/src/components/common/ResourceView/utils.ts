import type { ResourceViewSpaceItem } from '@lightdash/common';
import { assertUnreachable } from '@lightdash/common';
import { ResourceAccess } from './types';

export const getResourceAccessType = (
    item: ResourceViewSpaceItem,
): ResourceAccess => {
    if (!item.data.isPrivate) {
        return ResourceAccess.Public;
    } else if (item.data.accessListLength > 1) {
        return ResourceAccess.Shared;
    } else {
        return ResourceAccess.Private;
    }
};

export const getResourceAccessLabel = (item: ResourceViewSpaceItem) => {
    const accessType = getResourceAccessType(item);

    switch (accessType) {
        case ResourceAccess.Private:
            return 'Only visible to you';
        case ResourceAccess.Public:
            return 'Everyone in this project has access';
        case ResourceAccess.Shared:
            return `Shared with ${item.data.accessListLength} user${
                item.data.accessListLength > 1 ? 's' : ''
            }`;
        default:
            return assertUnreachable(
                accessType,
                `Unknown access type ${accessType}`,
            );
    }
};
