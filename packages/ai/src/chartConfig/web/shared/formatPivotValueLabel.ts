import { friendlyName, isField, type ItemsMap } from '@lightdash/common';
import { type PivotReference } from '@lightdash/common';
import { formatItemValue } from '@lightdash/common';

export const formatPivotValueLabel = (
    pivotReference: PivotReference,
    fieldsMap: ItemsMap,
): string => {
    if (!pivotReference.pivotValues?.[0]) {
        return '';
    }

    const pivotFieldId = pivotReference.pivotValues[0].field;
    const pivotField = fieldsMap[pivotFieldId];
    const pivotValue = pivotReference.pivotValues[0].value;

    if (pivotField && isField(pivotField)) {
        return formatItemValue(pivotField, pivotValue, false, undefined);
    }

    return friendlyName(String(pivotValue));
};
