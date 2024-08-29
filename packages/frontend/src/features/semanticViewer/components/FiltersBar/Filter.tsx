import {
    SemanticLayerStringFilterOperator,
    type SemanticLayerFilter,
} from '@lightdash/common';
import { ActionIcon, Flex, Select, type SelectItem } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import type { FC } from 'react';
import MultiStringInput from './MultiStringInput';

interface FilterProps {
    filter: SemanticLayerFilter;
    availableFields: SelectItem[];
    onDelete: () => void;
    onUpdate: (filter: SemanticLayerFilter) => void;
}

const Filter: FC<FilterProps> = ({
    filter,
    availableFields,
    onDelete,
    onUpdate,
}) => {
    return (
        <Flex align="center" gap="xs" m="sm">
            <Select
                size="xs"
                style={{ flex: 1 }}
                data={availableFields}
                value={filter.field}
                onChange={(value) => {
                    if (!value) {
                        return;
                    }

                    onUpdate({ ...filter, field: value });
                }}
            />
            {/* TODO: Add operator dropdown - this should come from filter.availableOperators which isn't yet available from the API */}
            <Select
                size="xs"
                style={{ flex: 1 }}
                data={Object.values(SemanticLayerStringFilterOperator)}
                value={filter.operator}
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
