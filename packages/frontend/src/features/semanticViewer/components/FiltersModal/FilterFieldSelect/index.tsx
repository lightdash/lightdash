import {
    ActionIcon,
    Box,
    Group,
    rem,
    Select,
    type SelectItem,
} from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import FilterFieldSelectItem from './FilterFieldSelectItem';

type FilterFieldInputProps = {
    availableFieldOptions: SelectItem[];
    onCreateFilter: (fieldName: string) => void;
    onCancelCreateFilter: () => void;
    hasLeftSpacing?: boolean;
};

const LEFT_COMPONENT_WIDTH = rem(44);

const FilterFieldInput: FC<FilterFieldInputProps> = ({
    availableFieldOptions,
    onCreateFilter,
    onCancelCreateFilter,
    hasLeftSpacing,
}) => {
    return (
        <Group spacing="xs" w="100%">
            {hasLeftSpacing && (
                <Box w={LEFT_COMPONENT_WIDTH} style={{ flexShrink: 0 }}></Box>
            )}
            <Select
                style={{ flex: 5 }}
                size="xs"
                data={availableFieldOptions}
                itemComponent={FilterFieldSelectItem}
                placeholder="Select field"
                searchable
                withinPortal={true}
                onChange={(value) => {
                    if (!value) {
                        return;
                    }

                    onCreateFilter(value);
                }}
            />
            {/* These Selects are just to make up a mock disabled filter (creation state basically) */}
            <Select size="xs" w={75} data={[]} disabled></Select>
            <Select size="xs" style={{ flex: 5 }} disabled data={[]}></Select>
            <ActionIcon size="xs" onClick={onCancelCreateFilter}>
                <MantineIcon icon={IconX} />
            </ActionIcon>
        </Group>
    );
};

export default FilterFieldInput;
