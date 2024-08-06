import {
    assertUnreachable,
    CustomFormatType,
    getFieldQuoteChar,
    MetricType,
    type CustomFormat,
    type Metric,
    type SortField,
    type TableCalculation,
    type WarehouseTypes,
} from '@lightdash/common';
import { Menu } from '@mantine/core';
import { type FC } from 'react';
import { useParams } from 'react-router-dom';
import { getUniqueTableCalculationName } from '../../../features/tableCalculation/utils';
import { useProject } from '../../../hooks/useProject';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
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
        MetricType.PERCENTILE,
        MetricType.MEDIAN,
        MetricType.AVERAGE,
        MetricType.COUNT,
        MetricType.COUNT_DISTINCT,
        MetricType.SUM,
        // MIN and MAX can be of non-numeric types, like dates
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
    sorts: SortField[],
    warehouseType: WarehouseTypes | undefined,
) => {
    const fieldQuoteChar = getFieldQuoteChar(warehouseType);

    const orderSql = (reverseSorting: boolean = false) =>
        sorts.length > 0
            ? `ORDER BY ${sorts
                  .map((sort) => {
                      const fieldSort = sort.descending ? 'DESC' : 'ASC';
                      const reverseSort = sort.descending ? 'ASC' : 'DESC';
                      const sortOrder = reverseSorting
                          ? reverseSort
                          : fieldSort;
                      return `${fieldQuoteChar}${sort.fieldId}${fieldQuoteChar} ${sortOrder}`;
                  })
                  .join(', ')} `
            : '';

    switch (quickCalculation) {
        case QuickCalculation.PERCENT_CHANGE_FROM_PREVIOUS:
            return `(
              \${${fieldReference}} / NULLIF(LAG(\${${fieldReference}}) OVER(${orderSql(
                true,
            )}) ,0)
            ) - 1`;
        case QuickCalculation.PERCENT_OF_PREVIOUS_VALUE:
            return `(
              \${${fieldReference}} / NULLIF(LAG(\${${fieldReference}}) OVER(${orderSql(
                true,
            )}),0)
            )`;
        case QuickCalculation.PERCENT_OF_COLUMN_TOTAL:
            return `(
              \${${fieldReference}} / NULLIF(SUM(\${${fieldReference}}) OVER(),0) 
            )`;
        case QuickCalculation.RANK_IN_COLUMN:
            return `RANK() OVER(ORDER BY \${${fieldReference}} ASC)`;
        case QuickCalculation.RUNNING_TOTAL:
            return `SUM(\${${fieldReference}}) OVER(${orderSql(
                false,
            )} ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
            
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
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: project } = useProject(projectUuid);
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
                                    project?.warehouseConnection?.type,
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
