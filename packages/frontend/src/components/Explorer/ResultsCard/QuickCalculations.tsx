import {
    assertUnreachable,
    CustomFormatType,
    MetricType,
    type CustomFormat,
    type Metric,
    type TableCalculation,
} from '@lightdash/common';
import { Menu } from '@mantine/core';
import { type FC } from 'react';
import { useExplorerContext } from '../../../providers/ExplorerProvider';

import { getUniqueTableCalculationName } from '../../../features/tableCalculation/utils';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';

type Props = {
    item: Metric;
};

enum QuickCalculation {
    PERCENT_CHANGE_FROM_PREVIOUS = `Percent change from previous`,
    PERCENT_OF_PREVIOUS_VALUE = `Percent of previous value`,
    PERCENT_OF_COLUMN_TOTAL = `Percent of column total`,
    RANK_IN_COLUMN = `Rank in column`,
    RUNNING_TOTAL = `Running total`,
}

const getFormatForQuickCalculation = (
    quickCalculation: QuickCalculation,
): CustomFormat | undefined => {
    switch (quickCalculation) {
        case QuickCalculation.PERCENT_CHANGE_FROM_PREVIOUS:
        case QuickCalculation.PERCENT_OF_PREVIOUS_VALUE:
        case QuickCalculation.PERCENT_OF_COLUMN_TOTAL:
            return {
                type: CustomFormatType.PERCENT,
                round: 2,
            };
        case QuickCalculation.RANK_IN_COLUMN:
            return undefined;
        case QuickCalculation.RUNNING_TOTAL:
            return {
                type: CustomFormatType.NUMBER,
                round: 2,
            };
        default:
            assertUnreachable(
                quickCalculation,
                `Unknown quick calculation ${quickCalculation}`,
            );
    }
    return undefined;
};

const isCalculationAvailable = (
    quickCalculation: QuickCalculation,
    item: Metric,
) => {
    const numericTypes: string[] = [
        MetricType.NUMBER,
        MetricType.COUNT,
        MetricType.SUM,
    ];
    switch (quickCalculation) {
        case QuickCalculation.PERCENT_CHANGE_FROM_PREVIOUS:
        case QuickCalculation.PERCENT_OF_PREVIOUS_VALUE:
        case QuickCalculation.PERCENT_OF_COLUMN_TOTAL:
        case QuickCalculation.RUNNING_TOTAL:
            return numericTypes.includes(item.type);
        case QuickCalculation.RANK_IN_COLUMN:
            return true; // any type

        default:
            assertUnreachable(
                quickCalculation,
                `Unknown quick calculation ${quickCalculation}`,
            );
    }
    return '';
};

const getSqlForQuickCalculation = (
    quickCalculation: QuickCalculation,
    fieldReference: string,
    order: string[],
) => {
    const orderSql = order.length > 0 ? `ORDER BY ${order.join(', ')} ` : '';
    switch (quickCalculation) {
        case QuickCalculation.PERCENT_CHANGE_FROM_PREVIOUS:
            return `(
              \${${fieldReference}} / LAG(\${${fieldReference}}) OVER(${orderSql}) 
            ) - 1`;
        case QuickCalculation.PERCENT_OF_PREVIOUS_VALUE:
            return `(
              \${${fieldReference}} / LAG(\${${fieldReference}}) OVER(${orderSql})
            )`;
        case QuickCalculation.PERCENT_OF_COLUMN_TOTAL:
            return `(
              \${${fieldReference}} / SUM(\${${fieldReference}}) OVER()
            )`;
        case QuickCalculation.RANK_IN_COLUMN:
            return `RANK() OVER(ORDER BY \${${fieldReference}} ASC)`;
        case QuickCalculation.RUNNING_TOTAL:
            return `SUM(\${${fieldReference}}) OVER(${orderSql} ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
            
          `;
        default:
            assertUnreachable(
                quickCalculation,
                `Unknown quick calculation ${quickCalculation}`,
            );
    }
    return '';
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
    const columnOrder = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableConfig.columnOrder,
    );

    const tableCalculations = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.tableCalculations,
    );
    const orderWithoutTableCalculations = columnOrder.filter(
        (order) => !tableCalculations.some((tc) => tc.name === order),
    );

    return (
        <>
            <Menu.Label>Add quick calculation</Menu.Label>

            {Object.values(QuickCalculation).map((quickCalculation) => {
                const fieldReference = `${item.table}.${item.name}`;
                if (!isCalculationAvailable(quickCalculation, item))
                    return null;
                return (
                    <Menu.Item
                        key={quickCalculation}
                        onClick={() => {
                            const name = `${quickCalculation} of ${item.label}`;
                            onCreate({
                                name: getUniqueTableCalculationName(
                                    name,
                                    tableCalculations,
                                ),
                                displayName: name,
                                sql: getSqlForQuickCalculation(
                                    quickCalculation as QuickCalculation,
                                    fieldReference,
                                    orderWithoutTableCalculations,
                                ),
                                format: getFormatForQuickCalculation(
                                    quickCalculation as QuickCalculation,
                                ),
                            });
                        }}
                    >
                        {quickCalculation}
                    </Menu.Item>
                );
            })}
        </>
    );
};

export default QuickCalculationMenuOptions;
