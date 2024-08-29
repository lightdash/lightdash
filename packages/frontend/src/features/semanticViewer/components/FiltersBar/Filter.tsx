import {
    type SemanticLayerField,
    type SemanticLayerFilter,
    type SemanticLayerStringFilterOperator,
} from '@lightdash/common';
import { ActionIcon, Flex, Select, type SelectItem } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MultiStringInput from './MultiStringInput';

interface FilterProps {
    filter: SemanticLayerFilter;
    fieldOptions: SelectItem[];
    allFields: SemanticLayerField[];
    onDelete: () => void;
    onUpdate: (filter: SemanticLayerFilter) => void;
}

const Filter: FC<FilterProps> = ({
    filter,
    fieldOptions,
    allFields,
    onDelete,
    onUpdate,
}) => {
    const currentField = useMemo(() => {
        return allFields.find((f) => f.name === filter.field);
    }, [allFields, filter.field]);

    // When field changes, reset operator to first available operator
    const currentOperator = useMemo(() => {
        return currentField?.availableOperators.includes(filter.operator)
            ? filter.operator
            : currentField?.availableOperators[0];
    }, [currentField, filter.operator]);

    return (
        <Flex align="center" gap="xs" w="50%">
            <Select
                size="xs"
                style={{ flex: 1 }}
                data={fieldOptions}
                value={filter.field}
                onChange={(value) => {
                    if (!value) {
                        return;
                    }

                    onUpdate({ ...filter, field: value });
                }}
            />
            <Select
                size="xs"
                style={{ flex: 1 }}
                data={currentField?.availableOperators ?? []}
                value={currentOperator}
                onChange={(value: SemanticLayerStringFilterOperator | null) => {
                    if (!value) {
                        return;
                    }

                    onUpdate({ ...filter, operator: value });
                }}
            />
            <MultiStringInput
                size="xs"
                style={{ flex: 2 }}
                values={filter.values}
                onChange={(values) => {
                    onUpdate({ ...filter, values });
                }}
            />
            <ActionIcon size="xs" onClick={onDelete}>
                <IconTrash color="red" />
            </ActionIcon>
        </Flex>
    );
};

export default Filter;
