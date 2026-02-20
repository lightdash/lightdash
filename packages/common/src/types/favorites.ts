import type { ContentType } from './content';
import type {
    ResourceViewChartItem,
    ResourceViewDashboardItem,
    ResourceViewSpaceItem,
} from './resourceViewItem';

export type ToggleFavoriteRequest = {
    contentType: ContentType;
    contentUuid: string;
};

export type ToggleFavoriteResponse = {
    isFavorite: boolean;
    contentType: ContentType;
    contentUuid: string;
};

export type FavoriteItems = Array<
    ResourceViewChartItem | ResourceViewDashboardItem | ResourceViewSpaceItem
>;

export type ApiFavoriteItems = {
    status: 'ok';
    results: FavoriteItems;
};

export type ApiToggleFavorite = {
    status: 'ok';
    results: ToggleFavoriteResponse;
};
