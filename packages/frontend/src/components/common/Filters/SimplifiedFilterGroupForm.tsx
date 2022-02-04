import { Colors } from '@blueprintjs/core';
import { FilterableField, FilterRule } from 'common';
import React, { FC, useCallback } from 'react';
import FilterRuleForm from './FilterRuleForm';

type Props = {
    fields: FilterableField[];
    filterRules: FilterRule[];
    onChange: (value: FilterRule[]) => void;
};

const SimplifiedFilterGroupForm: FC<Props> = ({
    fields,
    filterRules,
    onChange,
}) => {
    const onDeleteItem = useCallback(
        (index: number) => {
            onChange([
                ...filterRules.slice(0, index),
                ...filterRules.slice(index + 1),
            ]);
        },
        [filterRules, onChange],
    );

    const onChangeItem = useCallback(
        (index: number, item: FilterRule) => {
            onChange([
                ...filterRules.slice(0, index),
                item,
                ...filterRules.slice(index + 1),
            ]);
        },
        [filterRules, onChange],
    );

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
                    marginBottom: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                }}
            >
                <div
                    style={{
                        height: 30,
                        display: 'inline-flex',
                        alignItems: 'center',
                    }}
                >
                    <p
                        style={{
                            margin: 0,
                            marginLeft: 10,
                            color: Colors.GRAY2,
                        }}
                    >
                        All of the following conditions match:
                    </p>
                </div>
                <div style={{ position: 'relative' }}>
                    <div
                        style={{
                            width: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                        }}
                    >
                        {filterRules.map((item, index) => (
                            <div
                                key={item.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                }}
                            >
                                <div style={{ width: 60 }} />
                                <FilterRuleForm
                                    filterRule={item}
                                    fields={fields}
                                    onChange={(value) =>
                                        onChangeItem(index, value)
                                    }
                                    onDelete={() => onDeleteItem(index)}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SimplifiedFilterGroupForm;
