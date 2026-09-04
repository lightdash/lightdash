import { type DataAppVizField } from '@lightdash/common';
import { Box, Group, Text } from '@mantine/core';
import { type FC } from 'react';
import DataAppVizFieldTypeBadge from './DataAppVizFieldTypeBadge';

/** The typed field breakdown shared by the library and installed detail modals. */
const DataAppVizFieldsList: FC<{ fields: DataAppVizField[] }> = ({
    fields,
}) => (
    <Box>
        <Text fz={12} fw={600} c="ldGray.6" mb={4}>
            Fields
        </Text>
        <Group gap="sm">
            {fields.map((field) => (
                <Group key={field.name} gap={4} wrap="nowrap">
                    <DataAppVizFieldTypeBadge type={field.type} />
                    <Text fz="sm">{field.label}</Text>
                </Group>
            ))}
        </Group>
    </Box>
);

export default DataAppVizFieldsList;
