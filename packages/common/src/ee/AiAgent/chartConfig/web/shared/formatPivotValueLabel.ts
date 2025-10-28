import {
    friendlyName,
    isField,
    type ItemsMap,
} from '../../../../../types/field';
import { type PivotReference } from '../../../../../types/savedCharts';
import { formatItemValue } from '../../../../../utils/formatting';

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
