import { type SortField } from '@lightdash/common';

type Axis = { name?: unknown };
type AxisOptions = { xAxis?: Axis[]; yAxis?: Axis[] };
/** The field behind each axis, by axis index: [bottom, top] and [left, right]. */
export type AxisFields = {
    xAxis: Array<string | undefined>;
    yAxis: Array<string | undefined>;
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
