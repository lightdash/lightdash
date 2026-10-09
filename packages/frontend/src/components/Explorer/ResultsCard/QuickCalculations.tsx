import {
    assertUnreachable,
    CustomFormatType,
    evaluateConditionalFormatExpression,
    formatExpressionHasParameters,
    getCustomFormat,
    getEffectiveSeparator,
    hasValidFormatExpression,
    MetricType,
    TableCalculationTemplateType,
    type CustomFormat,
    type Metric,
    type ParametersValuesMap,
    type TableCalculation,
} from '@lightdash/common';
import { Menu } from '@mantine/core';
import { useCallback, type FC } from 'react';
import {
    explorerActions,
    selectParameters,
    selectSorts,
    selectTableCalculations,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { getUniqueTableCalculationName } from '../../../features/tableCalculation/utils';
import { TemplateTypeLabels } from '../../../features/tableCalculation/utils/templateFormatting';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { generateTableCalculationTemplate } from './tableCalculationTemplateGenerator';

type Props = {
    item: Metric;
    onCalculationCreated?: (tableCalculation: TableCalculation) => void;
};

// Use shared template labels from utilities

const getFormatForQuickCalculation = (
    templateType: TableCalculationTemplateType,
    item: Metric,
    parameters: ParametersValuesMap,
): CustomFormat | undefined => {
    switch (templateType) {
        case TableCalculationTemplateType.PERCENT_CHANGE_FROM_PREVIOUS:
        case TableCalculationTemplateType.PERCENT_OF_PREVIOUS_VALUE:
        case TableCalculationTemplateType.PERCENT_OF_COLUMN_TOTAL:
            return {
                type: CustomFormatType.PERCENT,
                round: 2,
            };
        case TableCalculationTemplateType.RANK_IN_COLUMN:
            return undefined;
        case TableCalculationTemplateType.RUNNING_TOTAL:
            return {
                type: CustomFormatType.NUMBER,
                round: 2,
            };
        case TableCalculationTemplateType.DIFFERENCE_FROM_PREVIOUS: {
            if (hasValidFormatExpression(item)) {
                const custom = evaluateConditionalFormatExpression(
                    item.format,
                    parameters,
                );
                if (
                    formatExpressionHasParameters(custom) ||
                    !hasValidFormatExpression({ ...item, format: custom })
                ) {
                    return { type: CustomFormatType.DEFAULT };
                }
                return {
                    type: CustomFormatType.CUSTOM,
                    custom,
                    separator: getEffectiveSeparator(item),
                };
            }
            const format = getCustomFormat(item);
            return format ? { ...format } : undefined;
        }
        case TableCalculationTemplateType.WINDOW_FUNCTION:
            return undefined; // Window functions not available in quick calcs TODO throw
        default:
            assertUnreachable(
                templateType,
                `Unknown template type ${templateType}`,
            );
    }
    return undefined;
};

const isCalculationAvailable = (
    templateType: TableCalculationTemplateType,
    item: Metric,
) => {
    const numericTypes: string[] = [
        MetricType.NUMBER,
        MetricType.PERCENTILE,
        MetricType.MEDIAN,
        MetricType.AVERAGE,
        MetricType.COUNT,
        MetricType.COUNT_DISTINCT,
        MetricType.SUM,
        MetricType.SUM_DISTINCT,
        MetricType.AVERAGE_DISTINCT,
        // MIN and MAX can be of non-numeric types, like dates
    ];
    switch (templateType) {
        case TableCalculationTemplateType.PERCENT_CHANGE_FROM_PREVIOUS:
        case TableCalculationTemplateType.DIFFERENCE_FROM_PREVIOUS:
        case TableCalculationTemplateType.PERCENT_OF_PREVIOUS_VALUE:
        case TableCalculationTemplateType.PERCENT_OF_COLUMN_TOTAL:
        case TableCalculationTemplateType.RUNNING_TOTAL:
            return numericTypes.includes(item.type);
        case TableCalculationTemplateType.RANK_IN_COLUMN:
            return true; // any type
        case TableCalculationTemplateType.WINDOW_FUNCTION:
            return false; // Window functions not available in quick calcs TODO throw

        default:
            return assertUnreachable(
                templateType,
                `Unknown template type ${templateType}`,
            );
    }
};

const QuickCalculationMenuOptions: FC<Props> = ({
    item,
    onCalculationCreated,
}) => {
    const dispatch = useExplorerDispatch();
    const { track } = useTracking();

    const handleAddTableCalculation = useCallback(
        (value: TableCalculation) => {
            dispatch(explorerActions.addTableCalculation(value));
            track({
                name: EventName.CREATE_QUICK_TABLE_CALCULATION_BUTTON_CLICKED,
            });
        },
        [dispatch, track],
    );

    const sorts = useExplorerSelector(selectSorts);
    const parameters = useExplorerSelector(selectParameters);
    const tableCalculations = useExplorerSelector(selectTableCalculations);
    const orderWithoutTableCalculations = sorts.filter(
        (sort) => !tableCalculations.some((tc) => tc.name === sort.fieldId),
    );

    const handleQuickCalculation = (
        templateType: TableCalculationTemplateType,
    ) => {
        const displayName = TemplateTypeLabels[templateType];
        const name = `${displayName} of ${item.label}`;
        const uniqueName = getUniqueTableCalculationName(
            name,
            tableCalculations,
        );

        const template = generateTableCalculationTemplate(
            {
                type: templateType,
                field: item,
                name: uniqueName,
                displayName: name,
            },
            orderWithoutTableCalculations,
        );

        const tableCalculation: TableCalculation = {
            name: uniqueName,
            displayName: name,
            template,
            format: getFormatForQuickCalculation(
                templateType,
                item,
                parameters,
            ),
        };

        handleAddTableCalculation(tableCalculation);
        onCalculationCreated?.(tableCalculation);
    };

    return (
        <>
            <Menu.Label>Add quick calculation</Menu.Label>

            {Object.values(TableCalculationTemplateType).map((templateType) => {
                if (!isCalculationAvailable(templateType, item)) return null;

                const displayName = TemplateTypeLabels[templateType];
                return (
                    <Menu.Item
                        key={templateType}
                        onClick={() => handleQuickCalculation(templateType)}
                    >
                        {displayName}
                    </Menu.Item>
                );
            })}
        </>
    );
};

export default QuickCalculationMenuOptions;
