import {
    assertUnreachable,
    FieldType,
    type SemanticLayerField,
} from '@lightdash/common';
import { Center, Loader, NavLink, Stack, Text } from '@mantine/core';
import { useSemanticLayerViewFields } from '../api/hooks';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { toggleField } from '../store/semanticViewerSlice';
import FieldIcon from './FieldIcon';

const getNavbarColorByFieldType = (
    fieldType: SemanticLayerField['fieldType'],
) => {
    switch (fieldType) {
        case FieldType.DIMENSION:
            return 'blue';
        case FieldType.METRIC:
            return 'orange';
        default:
            return assertUnreachable(
                fieldType,
                `Unknown field type ${fieldType}`,
            );
    }
};

const SidebarViewFields = () => {
    const { projectUuid, view, selectedDimensions, selectedMetrics } =
        useAppSelector((state) => state.semanticViewer);
    const dispatch = useAppDispatch();

    if (!view) {
        throw new Error('Impossible state');
    }

    const fields = useSemanticLayerViewFields({ projectUuid, view });

    if (fields.isError) {
        throw fields.error;
    }

    if (fields.isLoading) {
        return (
            <Center sx={{ flexGrow: 1 }}>
                <Loader color="gray" size="sm" />
            </Center>
        );
    }

    const handleFieldToggle = (field: string, fieldType: FieldType) => {
        dispatch(toggleField({ field, fieldType }));
    };

    return (
        <Stack spacing="one">
            {fields.data.map((field) => (
                <NavLink
                    key={field.name}
                    h="xxl"
                    color={getNavbarColorByFieldType(field.fieldType)}
                    label={<Text truncate>{field.label}</Text>}
                    icon={<FieldIcon field={field} />}
                    disabled={!field.visible}
                    active={
                        // FIXME: not the best way to check if a field is selected
                        selectedDimensions.includes(field.name) ||
                        selectedMetrics.includes(field.name)
                    }
                    onClick={() =>
                        handleFieldToggle(field.name, field.fieldType)
                    }
                />
            ))}
        </Stack>
    );
};

export default SidebarViewFields;
