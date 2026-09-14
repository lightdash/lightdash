import { type ChartRegistryEntry } from '@lightdash/common';
import { type ColorScheme } from '../../../theme/colors';

// Same-origin authenticated asset route (thumbnails, screenshots) served
// straight from the chart registry — a plain `<img src>` is enough, no
// query hook needed.
export const registryAssetUrl = (path: string): string =>
    `/api/v1/ee/chart-registry/assets?path=${encodeURIComponent(path)}`;

/** Thumbnail path for the active scheme; dark falls back to the light one. */
export const registryThumbnailPath = (
    item: Pick<ChartRegistryEntry, 'thumbnail' | 'thumbnailDark'>,
    colorScheme: ColorScheme,
): string | null =>
    colorScheme === 'dark'
        ? (item.thumbnailDark ?? item.thumbnail)
        : item.thumbnail;
