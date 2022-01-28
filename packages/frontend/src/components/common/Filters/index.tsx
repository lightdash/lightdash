import { Button, Tag } from '@blueprintjs/core';
import {
    fieldId,
    filterableDimensionsOnly,
    FilterOperator,
    FilterRule,
    getDimensions,
    getTotalFilterRules,
    isFilterRule,
} from 'common';
import React, { FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorer } from '../../../providers/ExplorerProvider';
import FilterRuleForm from './FilterRuleForm';

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
    const rules: Array<FilterRule> = getTotalFilterRules(activeFilters);

    const onDeleteFilterRule = (index: number) => {
        setActiveFilters({
            dimensions: {
                id: uuidv4(),
                and: [...rules.slice(0, index), ...rules.slice(index + 1)],
            },
        });
    };

    const onChangeFilterRule = (index: number, filterRule: FilterRule) => {
        setActiveFilters({
            dimensions: {
                id: uuidv4(),
                and: [
                    ...rules.slice(0, index),
                    filterRule,
                    ...rules.slice(index + 1),
                ],
            },
        });
    };

    const onAddFilterRule = () => {
        setActiveFilters({
            dimensions: {
                id: uuidv4(),
                and: [
                    ...rules,
                    {
                        id: uuidv4(),
                        target: {
                            fieldId: fieldId(filterableDimensions[0]),
                        },
                        operator: FilterOperator.NULL,
                    },
                ],
            },
        });
    };

    return (
        <div
            style={{
                margin: '10px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                alignItems: 'start',
            }}
        >
            <div
                style={{
                    width: '100%',
                    paddingBottom: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '5px',
                }}
            >
                {rules.length > 0 && (
                    <div
                        style={{ display: 'inline-flex', alignItems: 'center' }}
                    >
                        <p style={{ margin: 0, marginRight: 10 }}>
                            Operator: <Tag minimal>AND</Tag>
                        </p>
                    </div>
                )}
                {rules.map((filterRule, index) =>
                    isFilterRule(filterRule) ? (
                        <React.Fragment key={filterRule.id}>
                            <FilterRuleForm
                                filterRule={filterRule}
                                fields={filterableDimensions}
                                onChange={(value) =>
                                    onChangeFilterRule(index, value)
                                }
                                onDelete={() => onDeleteFilterRule(index)}
                            />
                        </React.Fragment>
                    ) : null,
                )}
            </div>
            {filterableDimensions.length > 0 && (
                <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <Button
                        minimal
                        icon="plus"
                        intent="primary"
                        onClick={onAddFilterRule}
                    >
                        Add filter
                    </Button>
                </div>
            )}
        </div>
    );
};

export default FiltersForm;
