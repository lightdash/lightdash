import { type SemanticLayerField } from '@lightdash/common';
import { Paper, Stack, Text, type StackProps } from '@mantine/core';
import { type FC } from 'react';
import SidebarViewFieldGroupItem from './SidebarViewFieldsGroupItem';

type SidebarViewFieldsGroupProps = {
    containerProps?: StackProps;
    groupLabel: string;
    isActive?: boolean;
    fields: SemanticLayerField[];
    searchQuery: string;
    handleFieldToggle: (field: SemanticLayerField) => void;
};

const SidebarViewFieldsGroup: FC<SidebarViewFieldsGroupProps> = ({
    containerProps = {},
    groupLabel,
    isActive = false,
    fields,
    searchQuery,
    handleFieldToggle,
}) => {
    if (fields.length === 0) return null;

    return (
        <Stack spacing="xxs" {...containerProps}>
            <Text
                transform="uppercase"
                fz="xs"
                fw={600}
                color="dimmed"
                ff="'Inter', sans-serif"
                sx={{ fontFeatureSettings: '"tnum"' }}
            >
                {groupLabel} ({fields.length})
            </Text>

            <Paper
                display="flex"
                radius="md"
                sx={{
                    flexDirection: 'column',
                    overflow: 'hidden',
                    gap: 1,
                }}
            >
                {fields.map((field) => (
                    <SidebarViewFieldGroupItem
                        key={field.name}
                        field={field}
                        searchQuery={searchQuery}
                        isActive={isActive}
                        onFieldToggle={() => handleFieldToggle(field)}
                    />
                ))}
            </Paper>
        </Stack>
    );
};

export default SidebarViewFieldsGroup;
