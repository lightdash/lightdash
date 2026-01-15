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

    Object.values(explore.tables || {}).forEach((table) => {
        (table.dimensions || []).forEach((dimension) => dimensions.push(dimension));
        (table.metrics || []).forEach((metric) => metrics.push(metric));
        (table.timeDimensions || []).forEach((timeDimension) =>
            timeDimensions.push(timeDimension),
        );
    });

    return { dimensions, metrics, timeDimensions };
};
