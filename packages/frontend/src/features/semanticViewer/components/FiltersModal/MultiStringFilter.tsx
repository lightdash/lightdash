import type {
    SemanticLayerField,
    SemanticLayerFilter,
} from '@lightdash/common';
import { Group, Select, type SelectItem } from '@mantine/core';
import { useMemo, type FC } from 'react';
import FilterMultiStringInput from '../../../../components/common/Filters/FilterInputs/FilterMultiStringInput';
import FilterFieldSelectItem from './FilterFieldSelectItem';
import getOperatorString from './getOperatorString';

type MultiStringFilterProps = {
    fieldOptions: SelectItem[];
    filterField?: SemanticLayerField;
    filter: SemanticLayerFilter;
    onUpdate: (filter: SemanticLayerFilter) => void;
};

const MultiStringFilter: FC<MultiStringFilterProps> = ({
    fieldOptions,
    filter,
    onUpdate,
    filterField,
}) => {
    const operatorsOpts = useMemo(() => {
        return filterField?.availableOperators.map((operator) => ({
            value: operator,
            label: getOperatorString(operator),
        }));
    }, [filterField]);

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

            <Select
                size="xs"
                w={75}
                withinPortal
                data={operatorsOpts ?? []}
                value={filter.operator}
                portalProps={{
                    color: 'red',
                }}
                onChange={(value: SemanticLayerFilter['operator'] | null) => {
                    if (!value) {
                        return;
                    }

                    onUpdate({
                        ...filter,
                        operator: value,
                    });
                }}
            />

            <FilterMultiStringInput
                size="xs"
                withinPortal
                style={{ flex: 5 }}
                values={filter.values}
                onChange={(values) => {
                    onUpdate({ ...filter, values });
                }}
            />
        </Group>
    );
};

export default MultiStringFilter;
