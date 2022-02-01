import { Button } from '@blueprintjs/core';
import {
    fieldId,
    FilterableDimension,
    FilterOperator,
    Filters,
    Metric,
} from 'common';
import React, { FC, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import FilterGroupForm from './FilterGroupForm';

type Props = {
    dimensions: FilterableDimension[];
    metrics: Metric[];
    filters: Filters;
    setFilters: (value: Filters) => void;
};

const FiltersForm: FC<Props> = ({
    dimensions,
    metrics,
    filters,
    setFilters,
}) => {
    const onAddDimensionsFilterGroup = useCallback(() => {
        setFilters({
            ...filters,
            dimensions: {
                id: uuidv4(),
                and: [
                    {
                        id: uuidv4(),
                        target: {
                            fieldId: fieldId(dimensions[0]),
                        },
                        operator: FilterOperator.EQUALS,
                    },
                ],
            },
        });
    }, [dimensions, filters, setFilters]);
    const onAddMetricsFilterGroup = useCallback(() => {
        setFilters({
            ...filters,
            metrics: {
                id: uuidv4(),
                and: [
                    {
                        id: uuidv4(),
                        target: {
                            fieldId: fieldId(metrics[0]),
                        },
                        operator: FilterOperator.EQUALS,
                    },
                ],
            },
        });
    }, [metrics, filters, setFilters]);
    return (
        <>
            Dimensions
            {filters.dimensions && (
                <FilterGroupForm
                    filterGroup={filters.dimensions}
                    fields={dimensions}
                    onChange={(value) =>
                        setFilters({
                            ...filters,
                            dimensions: value,
                        })
                    }
                    onDelete={() =>
                        setFilters({
                            ...filters,
                            dimensions: undefined,
                        })
                    }
                />
            )}
            Metrics
            {filters.metrics && (
                <FilterGroupForm
                    filterGroup={filters.metrics}
                    fields={metrics}
                    onChange={(value) =>
                        setFilters({
                            ...filters,
                            metrics: value,
                        })
                    }
                    onDelete={() =>
                        setFilters({
                            ...filters,
                            metrics: undefined,
                        })
                    }
                />
            )}
            {dimensions.length > 0 && !filters.dimensions && (
                <Button
                    minimal
                    icon="plus"
                    intent="primary"
                    onClick={onAddDimensionsFilterGroup}
                >
                    Add dimension filter
                </Button>
            )}
            {metrics.length > 0 && !filters.metrics && (
                <Button
                    minimal
                    icon="plus"
                    intent="primary"
                    onClick={onAddMetricsFilterGroup}
                >
                    Add metric filter
                </Button>
            )}
        </>
    );
};

export default FiltersForm;
