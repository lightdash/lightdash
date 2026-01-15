import type { Explore, ExploreField } from '../types/lightdash';

type GroupedExploreFields = {
    dimensions: ExploreField[];
    metrics: ExploreField[];
    timeDimensions: ExploreField[];
};

export const groupExploreFields = (explore: Explore): GroupedExploreFields => {
    const dimensions: ExploreField[] = [];
    const metrics: ExploreField[] = [];
    const timeDimensions: ExploreField[] = [];

    const toArray = (value?: ExploreField[] | Record<string, ExploreField>) =>
        Array.isArray(value) ? value : Object.values(value || {});

    const isTimeDimension = (field: ExploreField) => {
        const fieldType = field.type?.toLowerCase();
        return fieldType === 'date' || fieldType === 'timestamp';
    };

    Object.values(explore.tables || {}).forEach((table) => {
        const tableDimensions = toArray(table.dimensions);
        const tableMetrics = toArray(table.metrics);
        const tableTimeDimensions = toArray(
            (table as { timeDimensions?: ExploreField[] }).timeDimensions,
        );

        const derivedTimeDimensions = tableTimeDimensions.length
            ? tableTimeDimensions
            : tableDimensions.filter(isTimeDimension);
        const timeDimensionNames = new Set(
            derivedTimeDimensions.map((field) => field.name),
        );

        tableDimensions
            .filter((field) => !timeDimensionNames.has(field.name))
            .forEach((dimension) => dimensions.push(dimension));
        tableMetrics.forEach((metric) => metrics.push(metric));
        derivedTimeDimensions.forEach((timeDimension) =>
            timeDimensions.push(timeDimension),
        );
    });

    return { dimensions, metrics, timeDimensions };
};
