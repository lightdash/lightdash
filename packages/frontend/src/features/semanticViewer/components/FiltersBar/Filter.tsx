import type { SemanticLayerFilter } from '@lightdash/common';
import { Button, Flex, Select, type SelectItem } from '@mantine/core';
import type { FC } from 'react';

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
            <>{filter.operator}</>
            <>{filter.values}</>
            <Button onClick={onDelete}>Delete</Button>
        </Flex>
    );
};

export default Filter;
