import { assertUnreachable } from '@lightdash/common';
import { type ChartTypeOwner } from './chartTypeOwner';

// Values are URL `tab` params, kept stable across label renames.
export const GalleryTab = {
    PROJECT_LIBRARY: 'installed-charts',
    ORGANIZATION_LIBRARY: 'organization-library',
    LIGHTDASH_LIBRARY: 'chart-library',
} as const;

export type GalleryTabValue = (typeof GalleryTab)[keyof typeof GalleryTab];

/** Chart Studio's builder. For an organization chart type the project is
 *  only where real preview data comes from. */
export const chartTypeBuilderPath = (
    projectUuidOrSlug: string,
    dataAppVizUuidOrSlug: string | null,
    owner: ChartTypeOwner,
): string => {
    const target = dataAppVizUuidOrSlug ?? 'new';
    switch (owner) {
        case 'organization':
            return `/projects/${projectUuidOrSlug}/chart-studio/organization/${target}`;
        case 'project':
            return `/projects/${projectUuidOrSlug}/chart-studio/${target}`;
        default:
            return assertUnreachable(owner, 'Unknown chart type owner');
    }
};

/** The gallery tab a builder returns to. */
export const chartTypeGalleryPath = (
    projectUuidOrSlug: string,
    owner: ChartTypeOwner,
): string => {
    switch (owner) {
        case 'organization':
            return `/projects/${projectUuidOrSlug}/chart-studio?tab=${GalleryTab.ORGANIZATION_LIBRARY}`;
        case 'project':
            return `/projects/${projectUuidOrSlug}/chart-studio`;
        default:
            return assertUnreachable(owner, 'Unknown chart type owner');
    }
};
