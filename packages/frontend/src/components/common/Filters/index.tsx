import { Button } from '@blueprintjs/core';
import {
    addFilterRule,
    Field,
    FilterableDimension,
    Filters,
    Metric,
} from 'common';
import React, { FC, useCallback } from 'react';
import { useToggle } from 'react-use';
import FieldAutoComplete from './FieldAutoComplete';
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
    const [isOpen, toggleFieldInput] = useToggle(false);

    const addFieldRule = useCallback(
        (field: Field) => {
            setFilters(addFilterRule(filters, field));
            toggleFieldInput(false);
        },
        [filters, setFilters, toggleFieldInput],
    );

    const fields = [...metrics, ...dimensions];

    return (
        <>
            {filters.dimensions && (
                <FilterGroupForm
                    hideButtons
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
