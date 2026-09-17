import { type DataAppVizField } from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import styles from './DataAppVizFieldGuidance.module.css';

const defaultGuidance: Record<DataAppVizField['type'], string> = {
    dimension: 'Choose the category or label that identifies each row.',
    metric: 'Choose the numeric value for each row.',
    series: 'Choose the category that separates the chart into series.',
    column: 'Choose the result column the chart reads for this slot.',
};

const formatExample = (example: string | number | boolean | null): string =>
    example === null ? 'null' : String(example);

type Props = {
    field: DataAppVizField;
    id?: string;
    showMappingHint?: boolean;
};

/** Reusable help for a declared field wherever a viewer maps it to query data. */
const DataAppVizFieldGuidance: FC<Props> = ({ field, id, showMappingHint }) => (
    <Stack id={id} gap="xxs">
        <Text size="xs" c="dimmed" lh={1.4} className={styles.helpText}>
            {field.description?.trim() || defaultGuidance[field.type]}
        </Text>
        {field.examples && field.examples.length > 0 && (
            <Text size="xs" c="dimmed" lh={1.4} className={styles.helpText}>
                Examples: {field.examples.map(formatExample).join(', ')}
            </Text>
        )}
        {showMappingHint && field.required && (
            <Text size="xs" c="dimmed" lh={1.4}>
                Map this required field to continue.
            </Text>
        )}
    </Stack>
);

export default DataAppVizFieldGuidance;
