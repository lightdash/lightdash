import { Button, Colors, Divider, Tag } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import {
    addFilterRule,
    FilterableDimension,
    FilterableField,
    FilterRule,
    Filters,
    getFilterRulesByFieldType,
    getTotalFilterRules,
    Metric,
} from 'common';
import React, { FC, useCallback, useMemo } from 'react';
import { useToggle } from 'react-use';
import { v4 as uuidv4 } from 'uuid';
import FieldAutoComplete from './FieldAutoComplete';
import FilterGroupForm from './FilterGroupForm';
import SimplifiedFilterGroupForm from './SimplifiedFilterGroupForm';

type Props = {
    dimensions: FilterableDimension[];
    metrics: Metric[];
    filters: Filters;
    setFilters: (value: Filters, syncState: boolean) => void;
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

    const totalFilterRules = getTotalFilterRules(filters);
    const filterRulesPerFieldType = getFilterRulesByFieldType(
        fields,
        totalFilterRules,
    );
    const showSimplifiedForm: boolean =
        filterRulesPerFieldType.dimensions.length <= 1 &&
        filterRulesPerFieldType.metrics.length <= 1;
    const showMandatoryAndOperator: boolean =
        filterRulesPerFieldType.dimensions.length >= 1 &&
        filterRulesPerFieldType.metrics.length >= 1;

    const addFieldRule = useCallback(
        (field: FilterableField) => {
            setFilters(addFilterRule({ filters, field }), true);
            toggleFieldInput(false);
        },
        [filters, setFilters, toggleFieldInput],
    );

    const updateFieldRules = useCallback(
        (filterRules: FilterRule[]) => {
            const result = getFilterRulesByFieldType(fields, filterRules);

            setFilters(
                {
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
                },
                true,
            );
        },
        [fields, filters, setFilters],
    );

    return (
        <>
            {totalFilterRules.length >= 1 && (
                <>
                    {showSimplifiedForm ? (
                        <SimplifiedFilterGroupForm
                            fields={fields}
                            filterRules={getTotalFilterRules(filters)}
                            onChange={updateFieldRules}
                        />
                    ) : (
                        <>
                            <div style={{ position: 'relative' }}>
                                {showMandatoryAndOperator && (
                                    <Divider
                                        style={{
                                            position: 'absolute',
                                            height: '100%',
                                            top: 15,
                                            left: 35,
                                        }}
                                    />
                                )}
                                {filters.dimensions && (
                                    <FilterGroupForm
                                        hideButtons
                                        conditionLabel="dimension"
                                        filterGroup={filters.dimensions}
                                        fields={dimensions}
                                        onChange={(value) =>
                                            setFilters(
                                                {
                                                    ...filters,
                                                    dimensions: value,
                                                },
                                                false,
                                            )
                                        }
                                        onDelete={() =>
                                            setFilters(
                                                {
                                                    ...filters,
                                                    dimensions: undefined,
                                                },
                                                true,
                                            )
                                        }
                                    />
                                )}
                                {showMandatoryAndOperator && (
                                    <Tooltip2 content="You can only use the 'and' operator when combining metrics & dimensions">
                                        <Tag
                                            minimal
                                            round
                                            style={{
                                                background: Colors.LIGHT_GRAY2,
                                                marginLeft: 20,
                                                marginBottom: 10,
                                            }}
                                        >
                                            and
                                        </Tag>
                                    </Tooltip2>
                                )}
                            </div>
                            {filters.metrics && (
                                <FilterGroupForm
                                    hideButtons
                                    conditionLabel="metric"
                                    filterGroup={filters.metrics}
                                    fields={metrics}
                                    onChange={(value) =>
                                        setFilters(
                                            {
                                                ...filters,
                                                metrics: value,
                                            },
                                            false,
                                        )
                                    }
                                    onDelete={() =>
                                        setFilters(
                                            {
                                                ...filters,
                                                metrics: undefined,
                                            },
                                            true,
                                        )
                                    }
                                />
                            )}
                        </>
                    )}
                </>
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
