import { type DataAppVizField } from '@lightdash/common';
import { Box, Group, Stack, Text, VisuallyHidden } from '@mantine/core';
import { IconFlask } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import DataAppVizFieldTypeBadge from '../components/DataAppVizFieldTypeBadge';
import classes from './ChartInputsList.module.css';

type Props = {
    fields: DataAppVizField[];
};

/** The inputs the previewed version needs bound to a query. */
const ChartInputsList: FC<Props> = ({ fields }) => {
    if (fields.length === 0) return null;

    return (
        <Stack gap="xs">
            <Group justify="space-between" gap="xs" wrap="nowrap">
                <Text fz="sm" fw={600}>
                    Chart inputs
                </Text>
                <Group className={classes.sampleChip} gap={4} wrap="nowrap">
                    <MantineIcon icon={IconFlask} size={13} />
                    <Text size="xs">Sample data</Text>
                </Group>
            </Group>
            <Stack gap={6}>
                {fields.map((field) => (
                    <Box key={field.name} className={classes.field}>
                        <Group justify="space-between" gap="xs" wrap="nowrap">
                            <Text className={classes.fieldLabel} fz="sm">
                                {field.label}
                                {field.required && (
                                    <Text component="span" c="red" aria-hidden>
                                        {' *'}
                                    </Text>
                                )}
                            </Text>
                            <Group gap={4} wrap="nowrap" flex="0 0 auto">
                                {field.required && (
                                    <VisuallyHidden>Required</VisuallyHidden>
                                )}
                                <DataAppVizFieldTypeBadge type={field.type} />
                            </Group>
                        </Group>
                        {field.description && (
                            <Text
                                className={classes.fieldDescription}
                                size="xs"
                                c="dimmed"
                            >
                                {field.description}
                            </Text>
                        )}
                    </Box>
                ))}
            </Stack>
        </Stack>
    );
};

export default ChartInputsList;
