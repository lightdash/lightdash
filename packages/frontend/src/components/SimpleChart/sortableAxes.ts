import { type SortField } from '@lightdash/common';

type Axis = { name?: unknown };
type AxisOptions = { xAxis?: Axis[]; yAxis?: Axis[] };
/** The field behind each axis, by axis index: [bottom, top] and [left, right]. */
export type AxisFields = {
    xAxis: Array<string | undefined>;
    yAxis: Array<string | undefined>;
};

type ChartLayout = { xField?: string; yField?: string[]; flipAxes?: boolean };
type ChartSeries = { yAxisIndex?: number; encode: { yRef: { field: string } } };

/** Which field each drawn axis stands for, for any cartesian chart. */
export const getAxisFields = (
    layout: ChartLayout | undefined,
    series: ChartSeries[] | undefined,
): AxisFields => {
    // One value axis per side: the first series drawn against it
    const valueFields = [0, 1].map(
        (axisIndex) =>
            series?.find((item) => (item.yAxisIndex ?? 0) === axisIndex)?.encode
                .yRef.field,
    );
    valueFields[0] ??= layout?.yField?.[0];
    const categoryFields = [layout?.xField];
    return layout?.flipAxes
        ? { xAxis: valueFields, yAxis: categoryFields }
        : { xAxis: categoryFields, yAxis: valueFields };
};

const decorate = <A extends Axis>(
    axes: A[] | undefined,
    fieldIds: Array<string | undefined>,
    sort: SortField | undefined,
): A[] | undefined =>
    axes?.map((axis, index) => {
        const fieldId = fieldIds[index];
        if (!fieldId) return axis;
        const arrow =
            sort?.fieldId === fieldId ? (sort.descending ? ' ↓' : ' ↑') : '';
        // An axis without a title still sorts from its tick labels
        const name =
            typeof axis.name === 'string' && axis.name
                ? `${axis.name}${arrow}`
                : axis.name;
        return { ...axis, name, triggerEvent: true };
    });

/** Makes the axes with a field clickable and marks the sorted one's title. */
export const withSortableAxes = <T extends AxisOptions>(
    options: T,
    fields: AxisFields,
    sort: SortField | undefined,
): T => ({
    ...options,
    xAxis: decorate(options.xAxis, fields.xAxis, sort),
    yAxis: decorate(options.yAxis, fields.yAxis, sort),
});
