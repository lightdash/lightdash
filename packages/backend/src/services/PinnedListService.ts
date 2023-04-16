import {
    ResourceViewItem,
    ResourceViewItemType,
    SessionUser,
} from '@lightdash/common';
import { ResourceViewItemModel } from '../models/ResourceViewItemModel';
import { hasSpaceAccess } from './SpaceService/SpaceService';

type Dependencies = {
    resourceViewItemModel: ResourceViewItemModel;
};

export class PinnedListService {
    dependencies: Dependencies;

    constructor(dependencies: Dependencies) {
        this.dependencies = dependencies;
    }

    async getPinnedListByUuid(
        user: SessionUser,
        pinnedListUuid: string,
    ): Promise<ResourceViewItem[]> {
        const allPinnedItems =
            await this.dependencies.resourceViewItemModel.getResourceViewItemsByPinnedListUuid(
                pinnedListUuid,
            );
        const availablePinnedItems = allPinnedItems.filter((item) => {
            if (item.type === ResourceViewItemType.SPACE) {
                const a = item.data;
                return hasSpaceAccess(a, user.userUuid);
            }
            return true;
        });
        return pinnedList;
    }
}
