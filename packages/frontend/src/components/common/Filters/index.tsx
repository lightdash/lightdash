import { Button } from '@blueprintjs/core';
import {
    addFilterRule,
    Field,
    FilterableDimension,
    FilterRule,
    Filters,
    getFilterRulesByFieldType,
    getTotalFilterRules,
    Metric,
} from 'common';
import React, { FC, useCallback, useMemo } from 'react';
import { useToggle } from 'react-use';
import FieldAutoComplete from './FieldAutoComplete';
import FilterGroupForm from './FilterGroupForm';
import SimplifiedFilterGroupForm from './SimplifiedFilterGroupForm';

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
    const [isOpen, toggleFieldInput] = useToggle(false);
    const fields = useMemo(
        () => [...metrics, ...dimensions],
        [dimensions, metrics],
    );
    // Note: Show simplified view until we support AND and OR operator
    const showSimplifiedForm = true;

    const addFieldRule = useCallback(
        (field: Field) => {
            setFilters(addFilterRule(filters, field));
            toggleFieldInput(false);
        },
        [filters, setFilters, toggleFieldInput],
    );

    const updateFieldRules = useCallback(
        (filterRules: FilterRule[]) => {
            const result = getFilterRulesByFieldType(fields, filterRules);

            setFilters({
                ...filters,
                dimensions:
                    result.dimensions.length > 0
                        ? {
                              id: uuidv4(),
                              ...filters.dimensions,
                              and: result.dimensions,
                          }
                        : undefined,
                metrics:
                    result.metrics.length > 0
                        ? {
                              id: uuidv4(),
                              ...filters.metrics,
                              and: result.metrics,
                          }
                        : undefined,
            });
        },
        [fields, filters, setFilters],
    );

    return (
        <>
            {showSimplifiedForm ? (
                <SimplifiedFilterGroupForm
                    fields={fields}
                    filterRules={getTotalFilterRules(filters)}
                    onChange={updateFieldRules}
                />
            ) : (
                <div style={{ position: 'relative' }}>
                    {filters.dimensions && (
                        <FilterGroupForm
                            hideButtons
                            conditionLabel="dimension"
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
                    {filters.metrics && (
                        <FilterGroupForm
                            hideButtons
                            conditionLabel="metric"
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
                </div>
            )}

            <div
                style={{
                    margin: '10px',
                }}
            >
                {isOpen && (
                    <>
                        <FieldAutoComplete
                            autoFocus
                            fields={fields}
                            onChange={addFieldRule}
                            onClosed={toggleFieldInput}
                        />
                        <Button
                            style={{ marginLeft: 10 }}
                            minimal
                            icon="cross"
                            onClick={toggleFieldInput}
                        />
                    </>
                )}
                {!isOpen && (
                    <Button
                        minimal
                        icon="plus"
                        intent="primary"
                        onClick={toggleFieldInput}
                        disabled={fields.length <= 0}
                    >
                        Add filter
                    </Button>
                )}
            </div>
        </>
    );
};

export default FiltersForm;
