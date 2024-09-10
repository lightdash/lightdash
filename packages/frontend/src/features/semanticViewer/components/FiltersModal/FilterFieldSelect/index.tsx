import {
    SemanticLayerFieldType,
    type SemanticLayerField,
    type SemanticLayerFilter,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Select,
    type SelectItem,
} from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import MantineIcon from '../../../../../components/common/MantineIcon';
import useToaster from '../../../../../hooks/toaster/useToaster';
import { createFilterForOperator } from '../createFilterForOperator';
import getOperatorString from '../getOperatorString';
import FilterFieldSelectItem from './FilterFieldSelectItem';

type FilterFieldSelectProps = {
    availableFieldOptions: SelectItem[];
    fields: SemanticLayerField[];
    onAddFilter: (filter: SemanticLayerFilter) => void;
    onCancel: () => void;
};

const FilterFieldSelect: FC<FilterFieldSelectProps> = ({
    availableFieldOptions,
    fields,
    onAddFilter,
    onCancel,
}) => {
    const [tempTimeField, setTempTimeField] = useState<
        SemanticLayerField | undefined
    >();

    const { showToastError } = useToaster();

    const createFilter = (
        field: SemanticLayerField,
        operator?: SemanticLayerFilter['operator'],
    ) => {
        const filterOperator = operator ?? field.availableOperators[0];

        if (!filterOperator) {
            showToastError({
                title: 'Error',
                subtitle: 'No filter operators available for this field',
            });
            return;
        }

        return createFilterForOperator({
            uuid: uuidv4(),
            field: field.name,
            fieldKind: field.kind,
            fieldType: field.type,
            operator: filterOperator,
        });
    };

    return (
        <Group spacing="xs" w="100%" position="apart">
            <Select
                size="xs"
                data={availableFieldOptions}
                itemComponent={FilterFieldSelectItem}
                placeholder="Select field"
                searchable
                style={{ flex: 1 }}
                withinPortal={true}
                onChange={(value) => {
                    if (!value) {
                        return;
                    }

                    const field = fields.find((f) => f.name === value);

                    if (!field) {
                        return;
                    }

                    if (field.type === SemanticLayerFieldType.TIME) {
                        setTempTimeField(field);
                        return;
                    }

                    const filter = createFilter(field);

                    if (filter) {
                        onAddFilter(filter);
                    }
                }}
            />

            {tempTimeField && (
                <Group spacing="xs">
                    {tempTimeField.availableOperators.map((op) => {
                        return (
                            <Button
                                key={op}
                                size="xs"
                                variant="light"
                                onClick={() => {
                                    const filter = createFilter(
                                        tempTimeField,
                                        op,
                                    );

                                    if (filter) {
                                        onAddFilter(filter);
                                    }
                                }}
                            >
                                {getOperatorString(op)}
                            </Button>
                        );
                    })}
                    <ActionIcon size="xs" onClick={onCancel}>
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                </Group>
            )}
        </Group>
    );
};

export default FilterFieldSelect;
