import {
    assertUnreachable,
    SemanticLayerFieldType,
    type SemanticLayerField,
    type SemanticLayerFilter,
} from '@lightdash/common';
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
import { useCallback, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import useToaster from '../../../../../hooks/toaster/useToaster';
import { createFilterForOperator } from '../createFilterForOperator';
import FilterFieldSelectItem from './FilterFieldSelectItem';

type FilterFieldInputProps = {
    fields: SemanticLayerField[];
    fieldOptions: SelectItem[];
    onCreate?: (newFilter: SemanticLayerFilter) => void;
    onFieldSelect?: (selectedField: string) => void;
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
    fields,
    fieldOptions,
    value,
    onCreate,
    onFieldSelect,
    onCancel,
    hasLeftSpacing,
    isCreatingFilter,
    style,
}) => {
    const { showToastError } = useToaster();

    const handleFilterFieldChange = useCallback(
        (selectedField: string | null) => {
            if (!selectedField) {
                return;
            }

            onFieldSelect?.(selectedField);

            const field = fields.find((f) => f.name === selectedField);

            if (!field) {
                showToastError({
                    title: 'Error',
                    subtitle: 'Field not found',
                });
                return;
            }

            const defaultOperator = field.availableOperators[0];

            if (!defaultOperator) {
                showToastError({
                    title: 'Error',
                    subtitle: 'No filter operators available for this field',
                });
                return;
            }

            switch (field.type) {
                case SemanticLayerFieldType.STRING:
                case SemanticLayerFieldType.TIME:
                    onCreate?.(
                        createFilterForOperator({
                            fieldRef: field.name,
                            fieldKind: field.kind,
                            fieldType: field.type,
                            operator: defaultOperator,
                        }),
                    );

                    break;
                case SemanticLayerFieldType.BOOLEAN:
                case SemanticLayerFieldType.NUMBER:
                    throw new Error(
                        `Filters not implemented for field type: ${field.type}`,
                    );
                default:
                    return assertUnreachable(
                        field.type,
                        `Unknown field type: ${field.type}`,
                    );
            }
        },
        [fields, onCreate, onFieldSelect, showToastError],
    );

    return (
        <Group spacing="xs" w="100%" style={style}>
            {hasLeftSpacing && (
                <Box w={LEFT_COMPONENT_WIDTH} style={{ flexShrink: 0 }}></Box>
            )}
            <Select
                w={isCreatingFilter ? undefined : '100%'}
                style={isCreatingFilter ? { flex: 5 } : undefined}
                size="xs"
                value={value}
                data={fieldOptions}
                itemComponent={FilterFieldSelectItem}
                placeholder="Select field"
                searchable
                withinPortal={true}
                onChange={handleFilterFieldChange}
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
