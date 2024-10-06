import {
    assertUnreachable,
    isSemanticLayerBaseOperator,
    isSemanticLayerRelativeTimeFilter,
    isSemanticLayerRelativeTimeValue,
    SemanticLayerFilterRelativeTimeValue,
    type SemanticLayerField,
    type SemanticLayerFilter,
    type SemanticLayerTimeFilter,
} from '@lightdash/common';
import { Group, rem, Select, type SelectItem } from '@mantine/core';
import { useMemo, type FC } from 'react';
import FilterFieldSelect from '../FilterFieldSelect';
import getOperatorString from '../getOperatorString';

function getRelativeTimeReadableString(
    value: SemanticLayerFilterRelativeTimeValue,
) {
    switch (value) {
        case SemanticLayerFilterRelativeTimeValue.TODAY:
            return 'today';
        case SemanticLayerFilterRelativeTimeValue.YESTERDAY:
            return 'yesterday';
        case SemanticLayerFilterRelativeTimeValue.LAST_7_DAYS:
            return 'last 7 days';
        case SemanticLayerFilterRelativeTimeValue.LAST_30_DAYS:
            return 'last 30 days';
        default:
            return assertUnreachable(value, `Unknown relative time ${value}`);
    }
}

type RelativeTimeFilterProps = {
    fields: SemanticLayerField[];
    filter: SemanticLayerTimeFilter;
    onUpdate: (filter: SemanticLayerFilter) => void;
    fieldOptions: SelectItem[];
    filterField?: SemanticLayerField;
};

const RelativeTimeFilter: FC<RelativeTimeFilterProps> = ({
    fields,
    filter,
    onUpdate,
    fieldOptions,
    filterField,
}) => {
    const operatorsOpts = useMemo(() => {
        return filterField?.availableOperators.map((operator) => ({
            value: operator,
            label: getOperatorString(operator),
        }));
    }, [filterField]);

    const relativeTimeOpts = useMemo<SelectItem[]>(() => {
        return Object.values(SemanticLayerFilterRelativeTimeValue).map(
            (value) => ({ value, label: getRelativeTimeReadableString(value) }),
        );
    }, []);

    return (
        <Group spacing="xs" w="100%" align="center" noWrap>
            <FilterFieldSelect
                style={{ flex: 5 }}
                fields={fields}
                fieldOptions={fieldOptions}
                value={filter.fieldRef}
                onFieldSelect={(value) => {
                    if (!value) {
                        return;
                    }

                    onUpdate({
                        ...filter,
                        fieldRef: value,
                    });
                }}
            />

            <Select
                size="xs"
                w={75}
                // paddingRight style on the input field to prevent the text from
                // being hidden on different OS and browsers
                styles={{ input: { paddingRight: rem(20) } }}
                withinPortal
                data={operatorsOpts ?? []}
                value={filter.operator}
                onChange={(value: SemanticLayerFilter['operator']) => {
                    if (isSemanticLayerBaseOperator(value)) {
                        onUpdate({ ...filter, operator: value });
                    }
                }}
            />

            {isSemanticLayerRelativeTimeFilter(filter) && (
                <Select
                    size="xs"
                    value={filter.values.relativeTime}
                    data={relativeTimeOpts}
                    style={{ flex: 5 }}
                    withinPortal
                    onChange={(value) => {
                        if (!value) {
                            return;
                        }

                        if (isSemanticLayerRelativeTimeValue(value)) {
                            onUpdate({
                                ...filter,
                                values: {
                                    relativeTime: value,
                                },
                            });
                            return;
                        }
                    }}
                />
            )}
        </Group>
    );
};

export default RelativeTimeFilter;
