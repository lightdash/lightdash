import {
    assertUnreachable,
    isSemanticLayerRelativeTimeOperator,
    SemanticLayerFilterRelativeTimeOperator,
    type SemanticLayerField,
    type SemanticLayerFilter,
    type SemanticLayerRelativeTimeFilter,
} from '@lightdash/common';
import {
    Group,
    Select,
    Text,
    useMantineTheme,
    type SelectItem,
} from '@mantine/core';
import { useMemo, type FC } from 'react';
import FilterFieldSelectItem from './FilterFieldSelectItem';
import getOperatorString from './getOperatorString';

type RelativeTimeFilterProps = {
    filter: SemanticLayerRelativeTimeFilter;
    onUpdate: (filter: SemanticLayerFilter) => void;
    fieldOptions: SelectItem[];
    filterField?: SemanticLayerField;
};

const RelativeTimeFilter: FC<RelativeTimeFilterProps> = ({
    filter,
    onUpdate,
    fieldOptions,
    filterField,
}) => {
    const operatorsOpts = useMemo(() => {
        return filterField?.availableOperators
            .filter((op) => isSemanticLayerRelativeTimeOperator(op))
            .map((operator) => ({
                value: operator,
                label: getOperatorString(operator),
            }));
    }, [filterField]);

    const theme = useMantineTheme();

    const relativeTimeOperatorText = useMemo(() => {
        switch (filter.operator) {
            case SemanticLayerFilterRelativeTimeOperator.IS_TODAY:
                return 'is';
            case SemanticLayerFilterRelativeTimeOperator.IS_YESTERDAY:
                return 'is';
            case SemanticLayerFilterRelativeTimeOperator.IN_LAST_7_DAYS:
                return 'in the';
            case SemanticLayerFilterRelativeTimeOperator.IN_LAST_30_DAYS:
                return 'in the';
            default:
                return assertUnreachable(
                    filter.operator,
                    `Unknown semantic layer relative time operator: ${filter.operator}`,
                );
        }
    }, [filter.operator]);

    return (
        <Group spacing="xs" w="100%" align="center" noWrap>
            <Select
                size="xs"
                withinPortal
                style={{ flex: 5 }}
                data={fieldOptions}
                itemComponent={FilterFieldSelectItem}
                value={filter.field}
                onChange={(value) => {
                    if (!value) {
                        return;
                    }

                    onUpdate({
                        ...filter,
                        field: value,
                    });
                }}
            />

            <Text size="xs" fw="bold" color={theme.colors.gray[6]}>
                {relativeTimeOperatorText}
            </Text>

            <Select
                size="xs"
                withinPortal
                data={operatorsOpts ?? []}
                value={filter.operator}
                onChange={(value: SemanticLayerFilterRelativeTimeOperator) => {
                    if (!value) {
                        return;
                    }

                    if (isSemanticLayerRelativeTimeOperator(value)) {
                        onUpdate({
                            ...filter,
                            operator: value,
                            values: undefined,
                        });
                    }
                }}
            />
        </Group>
    );
};

export default RelativeTimeFilter;
