import type { Filter, InternalFilterDefinition } from './types';

/** Shared Filter[] → internal conversion (QueryBuilder and savedChart). */
export function toInternalFilters(
    filters: Filter[],
): InternalFilterDefinition[] {
    return filters.map((f) => {
        const values: (string | number | boolean)[] = [];
        if (f.value !== undefined) {
            if (Array.isArray(f.value)) {
                values.push(...f.value);
            } else {
                values.push(f.value);
            }
        }
        return {
            fieldId: f.field,
            operator: f.operator,
            values,
            settings: f.unit
                ? {
                      unitOfTime: f.unit,
                      ...(f.completed !== undefined && {
                          completed: f.completed,
                      }),
                  }
                : null,
        };
    });
}
