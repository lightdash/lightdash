import {
    CustomFormatType,
    MetricType,
    TableCalculationTemplateType,
    assertUnreachable,
    type CustomFormat,
    type Metric,
    type TableCalculation,
} from '@lightdash/common';
import { Menu } from '@mantine/core';
import { type FC } from 'react';
import { getUniqueTableCalculationName } from '../../../features/tableCalculation/utils';
import { TemplateTypeLabels } from '../../../features/tableCalculation/utils/templateFormatting';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { generateTableCalculationTemplate } from './tableCalculationTemplateGenerator';

type Props = {
    item: Metric;
};

// Use shared template labels from utilities

const getFormatForQuickCalculation = (
    templateType: TableCalculationTemplateType,
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
        case TableCalculationTemplateType.PERCENT_RANK:
            return {
                type: CustomFormatType.PERCENT,
                round: 2,
            };
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
        // MIN and MAX can be of non-numeric types, like dates
    ];
    switch (templateType) {
        case TableCalculationTemplateType.PERCENT_CHANGE_FROM_PREVIOUS:
        case TableCalculationTemplateType.PERCENT_OF_PREVIOUS_VALUE:
        case TableCalculationTemplateType.PERCENT_OF_COLUMN_TOTAL:
        case TableCalculationTemplateType.RUNNING_TOTAL:
            return numericTypes.includes(item.type);
        case TableCalculationTemplateType.RANK_IN_COLUMN:
        case TableCalculationTemplateType.PERCENT_RANK:
            return true; // any type

        default:
            return assertUnreachable(
                templateType,
                `Unknown template type ${templateType}`,
            );
    }
};

const QuickCalculationMenuOptions: FC<Props> = ({ item }) => {
    const addTableCalculation = useExplorerContext(
        (context) => context.actions.addTableCalculation,
    );
    const { track } = useTracking();
    const onCreate = (value: TableCalculation) => {
        addTableCalculation(value);
        track({
            name: EventName.CREATE_QUICK_TABLE_CALCULATION_BUTTON_CLICKED,
        });
    };
    const sorts = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery.sorts,
    );
    const tableCalculations = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.tableCalculations,
    );
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

        onCreate({
            name: uniqueName,
            displayName: name,
            template,
            format: getFormatForQuickCalculation(templateType),
        });
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
