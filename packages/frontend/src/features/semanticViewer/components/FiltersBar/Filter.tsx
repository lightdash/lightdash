import {
    SemanticLayerStringFilterOperator,
    type SemanticLayerFilter,
} from '@lightdash/common';
import { Button, Flex, Select, type SelectItem } from '@mantine/core';
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
        <Flex>
            <Select
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
                values={filter.values}
                onChange={(values) => {
                    onUpdate({ ...filter, values });
                }}
            />
            <Button onClick={onDelete}>Delete</Button>
        </Flex>
    );
};

export default Filter;
