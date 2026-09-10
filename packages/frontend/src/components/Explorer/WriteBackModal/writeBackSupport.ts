import { type CustomDimension } from '@lightdash/common';

export const BIN_ORDERING_WRITE_BACK_WARNING =
    'Existing saved charts will keep using this custom bin so their ordering is unchanged. After merging and refreshing your project, use the new YAML dimension in new charts and add a separate numeric ordering dimension in your model when bin order matters.';

export const getCustomDimensionsForWriteBack = (
    customDimensions: CustomDimension[] | undefined,
    canManageCustomFields: boolean,
): CustomDimension[] => {
    if (!customDimensions || !canManageCustomFields) return [];
    return customDimensions;
};
