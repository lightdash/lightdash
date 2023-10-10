import { friendlyName } from '@lightdash/common';

export function convertDimensionNameToLabels(name: string) {
    const nameParts = name.split('__');
    const tableLabel = nameParts.length > 1 ? friendlyName(nameParts[0]) : null;
    const dimensionLabel = friendlyName(
        nameParts[nameParts.length - 1].replace(
            new RegExp(`^${tableLabel}`, 'i'),
            '',
        ), // remove duplicate table label
    );
    return {
        dimensionLabel,
        tableLabel,
    };
}
