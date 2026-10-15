import { type CustomDimension } from '@lightdash/common';

export const getCustomDimensionsForWriteBack = (
    customDimensions: CustomDimension[] | undefined,
    canManageCustomFields: boolean,
): CustomDimension[] => {
    if (!customDimensions || !canManageCustomFields) return [];
    return customDimensions;
};
