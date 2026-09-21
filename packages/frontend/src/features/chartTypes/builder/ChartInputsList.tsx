import { type DataAppVizField } from '@lightdash/common';
import { Group, Stack, Text, VisuallyHidden } from '@mantine/core';
import { type FC } from 'react';
import DataAppVizFieldTypeBadge from '../components/DataAppVizFieldTypeBadge';
import classes from './ConfigurePanel.module.css';

type Props = {
    fields: DataAppVizField[];
};

/** The inputs the previewed version needs bound to a query. */
const ChartInputsList: FC<Props> = ({ fields }) => {
    if (fields.length === 0) return null;

    return (
        <Stack className={classes.chartInputs} gap="xs">
            <Text fz="sm" fw={600}>
                Chart inputs
            </Text>
            <Stack gap={6}>
                {fields.map((field) => (
                    <Group
                        key={field.name}
                        justify="space-between"
                        gap="xs"
                        wrap="nowrap"
                    >
                        <Text fz="sm" truncate>
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
                ))}
            </Stack>
        </Stack>
    );
};

export default ChartInputsList;
