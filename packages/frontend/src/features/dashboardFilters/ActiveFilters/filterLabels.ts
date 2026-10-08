import {
    DimensionType,
    getFilterTypeFromItemType,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type UiStringResolver,
} from '@lightdash/common';
import {
    getConditionalRuleLabel,
    getConditionalRuleLabelFromItem,
} from '../../../components/common/Filters/FilterInputs/utils';
import { type SqlChartTileMetadata } from '../../../providers/Dashboard/types';

export const getFilterRuleLabels = (
    filterRule: DashboardFilterRule,
    field: DashboardFilterableField | undefined,
    sqlChartTilesMetadata: Record<string, SqlChartTileMetadata>,
    getUiString: UiStringResolver,
) => {
    if (field) {
        return getConditionalRuleLabelFromItem(filterRule, field, getUiString);
    } else {
        const column = Object.values(sqlChartTilesMetadata)
            .flatMap((tileMetadata) => tileMetadata.columns)
            .find(({ reference }) => reference === filterRule.target.fieldId);
        if (column) {
            return getConditionalRuleLabel(
                filterRule,
                getFilterTypeFromItemType(column.type),
                column.reference,
                getUiString,
            );
        }
        return getConditionalRuleLabel(
            filterRule,
            getFilterTypeFromItemType(
                filterRule.target.fallbackType ?? DimensionType.STRING,
            ),
            filterRule.target.fieldId,
            getUiString,
        );
    }
};

// Date values carry units ("2 months") and boolean values have localized
// labels, so both render the composed rule label instead of raw values
export const showsComposedFilterValue = (
    fieldType: DashboardFilterableField['type'] | undefined,
    fallbackType: DashboardFilterRule['target']['fallbackType'],
): boolean => {
    const type = fieldType ?? fallbackType ?? DimensionType.STRING;
    return (
        type === DimensionType.DATE ||
        type === DimensionType.TIMESTAMP ||
        type === DimensionType.BOOLEAN
    );
};
