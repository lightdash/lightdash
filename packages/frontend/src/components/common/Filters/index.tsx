import { Button, HTMLSelect, InputGroup, TagInput } from '@blueprintjs/core';
import {
    fieldId,
    FilterableDimension,
    filterableDimensionsOnly,
    FilterGroup,
    FilterOperator,
    FilterRule,
    getDimensions,
    isAndFilterGroup,
    isFilterRule,
    stringFilterOptions,
} from 'common';
import React, { FC } from 'react';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorer } from '../../../providers/ExplorerProvider';

type StringFilterFormProps = {
    filter: FilterRule;
    onChange: (value: FilterRule) => void;
};

const StringFilterForm = ({ filter, onChange }: StringFilterFormProps) => {
    const filterType = filter.operator;
    switch (filter.operator) {
        case FilterOperator.EQUALS:
        case FilterOperator.NOT_EQUALS:
            return (
                <TagInput
                    fill
                    addOnBlur
                    tagProps={{ minimal: true }}
                    values={filter.values}
                    onChange={(values) =>
                        onChange({
                            ...filter,
                            values,
                        })
                    }
                />
            );
        case FilterOperator.NULL:
        case FilterOperator.NOT_NULL:
            return null;
        case FilterOperator.STARTS_WITH:
        case FilterOperator.NOT_INCLUDE:
            return (
                <InputGroup
                    fill
                    value={filter.values?.[0]}
                    onChange={(e) =>
                        onChange({ ...filter, values: [e.currentTarget.value] })
                    }
                />
            );
        default: {
            throw Error(
                `No form implemented for String filter operator ${filterType}`,
            );
        }
    }
};

type Props2 = {
    selectedField: FilterableDimension;
    filterRule: FilterRule;
    onChange: (value: FilterRule) => void;
};

const FilterRuleInputs: FC<Props2> = ({
    selectedField,
    filterRule,
    onChange,
}) => {
    switch (selectedField.type) {
        case 'string':
            return <StringFilterForm filter={filterRule} onChange={onChange} />;
        default:
            return null;
    }
};

type Props = {
    fields: FilterableDimension[];
    filterRule: FilterRule;
    onChange: (value: FilterRule) => void;
    onDelete: () => void;
};

const FilterRuleForm: FC<Props> = ({
    fields,
    filterRule,
    onChange,
    onDelete,
}) => {
    const selectedField =
        fields.find((field) => fieldId(field) === filterRule.target.fieldId) ||
        fields[0];
    const selectOptions = fields.map((dim) => ({
        value: fieldId(dim),
        label: `${dim.tableLabel} ${dim.label}`,
    }));

    return (
        <div>
            <HTMLSelect
                style={{ maxWidth: '400px' }}
                fill={false}
                minimal
                onChange={(e) =>
                    onChange({
                        ...filterRule, // reset rule ?
                        target: {
                            fieldId: e.currentTarget.value,
                        },
                    })
                }
                options={[...selectOptions]}
                value={filterRule.target.fieldId || selectOptions[0].value}
            />
            <HTMLSelect
                style={{ maxWidth: '150px' }}
                fill={false}
                minimal
                onChange={(e) =>
                    onChange({
                        ...filterRule,
                        operator: e.currentTarget
                            .value as FilterRule['operator'],
                    })
                }
                options={stringFilterOptions}
                value={filterRule.operator}
            />
            <FilterRuleInputs
                selectedField={selectedField}
                filterRule={filterRule}
                onChange={onChange}
            />
            <Button onClick={onDelete}>Delete</Button>
        </div>
    );
};

const FiltersForm: FC = () => {
    const {
        state: { filters: activeFilters, tableName },
        actions: { setFilters: setActiveFilters },
    } = useExplorer();
    const explore = useExplore(tableName);
    if (explore.status !== 'success') return null;
    const filterableDimensions = filterableDimensionsOnly(
        getDimensions(explore.data) || [],
    );
    const rules: Array<FilterGroup | FilterRule> =
        activeFilters.dimensions && isAndFilterGroup(activeFilters.dimensions)
            ? activeFilters.dimensions.and
            : [];

    const onDeleteFilterRule = (index: number) => {
        setActiveFilters({
            dimensions: {
                id: 'root',
                and: [...rules.slice(0, index), ...rules.slice(index + 1)],
            },
        });
    };

    const onChangeFilterRule = (index: number, filterRule: FilterRule) => {
        setActiveFilters({
            dimensions: {
                id: 'root',
                and: [
                    ...rules.slice(0, index),
                    filterRule,
                    ...rules.slice(index + 1),
                ],
            },
        });
    };

    return (
        <div
            style={{
                paddingTop: '10px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                alignItems: 'start',
            }}
        >
            {rules.map((filterRule, index) =>
                isFilterRule(filterRule) ? (
                    <React.Fragment key={filterRule.id}>
                        <div
                            style={{
                                paddingLeft: '15px',
                                width: '100%',
                                paddingBottom: '20px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '5px',
                            }}
                        >
                            <FilterRuleForm
                                filterRule={filterRule}
                                fields={filterableDimensions}
                                onChange={(value) =>
                                    onChangeFilterRule(index, value)
                                }
                                onDelete={() => onDeleteFilterRule(index)}
                            />
                        </div>
                    </React.Fragment>
                ) : null,
            )}
            <Button>Add filter</Button>
        </div>
    );
};

export default FiltersForm;
