import {
    ActionIcon,
    Box,
    Group,
    rem,
    Select,
    type GroupProps,
    type SelectItem,
} from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import FilterFieldSelectItem from './FilterFieldSelectItem';

type FilterFieldInputProps = {
    availableFieldOptions: SelectItem[];
    onFieldChange: (fieldName: string) => void;
    value?: string;
    onCancel?: () => void;
    hasLeftSpacing?: boolean;
    isCreatingFilter?: boolean;
    style?: GroupProps['style'];
};

const LEFT_COMPONENT_WIDTH = rem(44);

/**
 * Select component for filter items
 * These Selects are just to make up a mock disabled filter (creation state basically)
 * we might be able to replace this with an actual Filter component and a partial filter but for simplicity we're doing it this way for now
 */
const FilterFieldSelect: FC<FilterFieldInputProps> = ({
    availableFieldOptions,
    value,
    onFieldChange,
    onCancel,
    hasLeftSpacing,
    isCreatingFilter,
    style,
}) => {
    return (
        <Group spacing="xs" w="100%" style={style}>
            {hasLeftSpacing && (
                <Box w={LEFT_COMPONENT_WIDTH} style={{ flexShrink: 0 }}></Box>
            )}
            <Select
                style={{ flex: 5 }}
                size="xs"
                value={value}
                data={availableFieldOptions}
                itemComponent={FilterFieldSelectItem}
                placeholder="Select field"
                searchable
                withinPortal={true}
                onChange={(fieldName) => {
                    if (!fieldName) {
                        return;
                    }

                    onFieldChange(fieldName);
                }}
            />
            {isCreatingFilter && (
                <>
                    <Select size="xs" w={75} data={[]} disabled></Select>
                    <Select
                        size="xs"
                        style={{ flex: 5 }}
                        disabled
                        data={[]}
                    ></Select>
                    {onCancel && (
                        <ActionIcon size="xs" onClick={onCancel}>
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    )}
                </>
            )}
        </Group>
    );
};

export default FilterFieldSelect;
