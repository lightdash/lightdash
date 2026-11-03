import { type ItemsMap } from '@lightdash/common';
import { Box, Group, Text, Tooltip } from '@mantine/core';
import { type Icon } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import FieldIcon from '../../../../../../components/common/Filters/FieldIcon';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { getFieldColors } from '../../../../../../utils/fieldColors';
import { FieldDetailHoverCard } from '../AgentVisualizationMetricsAndDimensions';
import chipClasses from '../QueryChip.module.css';
import styles from './NodeDetailsRow.module.css';
import { nodeFieldLabel } from './nodeFieldLabel';

/** One row of a node's details, marked by its icon. */
export const DetailsRow: FC<{
    icon: Icon;
    label: string;
    children: ReactNode;
}> = ({ icon, label, children }) => (
    <Group gap="xs" wrap="nowrap" align="flex-start">
        <Tooltip label={label} position="left">
            <Box className={styles.rowIcon}>
                <MantineIcon
                    icon={icon}
                    size={13}
                    color="ldGray.5"
                    aria-label={label}
                />
            </Box>
        </Tooltip>
        <Box flex={1} miw={0}>
            {children}
        </Box>
    </Group>
);

/** Muted text sitting on a chip line, e.g. a qualifier after chips. */
export const RowText: FC<{ children: string }> = ({ children }) => (
    <Text component="span" fz="xs" c="dimmed" className={styles.rowText}>
        {children}
    </Text>
);

/** A result column name, muted so it reads as an output rather than a field. */
export const OutputChip: FC<{ children: string }> = ({ children }) => (
    <Box
        component="span"
        className={styles.outputChip}
        data-testid="funnel-node-column"
    >
        {children}
    </Box>
);

export const FieldChip: FC<{
    fieldId: string;
    fieldsMap: ItemsMap;
    /** Dimmed role shown before the label, e.g. "Who". */
    prefix?: string;
    'data-testid'?: string;
}> = ({
    fieldId,
    fieldsMap,
    prefix,
    'data-testid': testId = 'semantic-node-field',
}) => {
    const item = fieldsMap[fieldId];
    return (
        <FieldDetailHoverCard field={item}>
            <Box
                component="span"
                className={chipClasses.chip}
                data-testid={testId}
            >
                {prefix && (
                    <Text component="span" fz="xs" c="dimmed">
                        {prefix}
                    </Text>
                )}
                {item && (
                    <FieldIcon
                        item={item}
                        color={getFieldColors(item).color}
                        size={12}
                    />
                )}
                <Text fz="xs" fw={600} truncate>
                    {nodeFieldLabel(fieldsMap, fieldId)}
                </Text>
            </Box>
        </FieldDetailHoverCard>
    );
};
