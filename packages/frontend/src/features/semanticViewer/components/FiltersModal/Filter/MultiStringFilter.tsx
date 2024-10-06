import {
    isSemanticLayerBaseOperator,
    type SemanticLayerField,
    type SemanticLayerFilter,
    type SemanticLayerStringFilter,
} from '@lightdash/common';
import { Group, rem, Select, type SelectItem } from '@mantine/core';
import { useMemo, type FC } from 'react';
import FilterMultiStringInput from '../../../../../components/common/Filters/FilterInputs/FilterMultiStringInput';
import FilterFieldSelect from '../FilterFieldSelect';
import getOperatorString from '../getOperatorString';

type MultiStringFilterProps = {
    fields: SemanticLayerField[];
    fieldOptions: SelectItem[];
    filterField?: SemanticLayerField;
    filter: SemanticLayerStringFilter; // Exact time filter doesn't have a component for now
    onUpdate: (filter: SemanticLayerFilter) => void;
};

const MultiStringFilter: FC<MultiStringFilterProps> = ({
    fields,
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
            <FilterFieldSelect
                style={{ flex: 5 }}
                fields={fields}
                fieldOptions={fieldOptions}
                value={filter.fieldRef}
                onFieldSelect={(selectedField) => {
                    if (!selectedField) {
                        return;
                    }

                    onUpdate({
                        ...filter,
                        fieldRef: selectedField,
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
