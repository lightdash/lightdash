import { type DepartmentOverlap } from '@lightdash/common';
import { Box, Group, ScrollArea, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import {
    formatOverlapUsage,
    getOverlapRowLabel,
    getOverlapSelection,
    isSameSelection,
    type OverlapSelection,
} from '../utils/departmentDetail';
import styles from './OverlapsSection.module.css';

// Every row is one height, so the list shows eight before it scrolls
const ROW_HEIGHT = 46;
const VISIBLE_ROWS = 8;

type Props = {
    overlaps: DepartmentOverlap[]; // most people first, as the server sends them
    selection: OverlapSelection | null;
    onSelect: (selection: OverlapSelection | null) => void;
};

export const OverlapList: FC<Props> = ({ overlaps, selection, onSelect }) => {
    const largest = overlaps.reduce(
        (most, overlap) => Math.max(most, overlap.people),
        0,
    );
    return (
        <ScrollArea.Autosize
            mah={ROW_HEIGHT * VISIBLE_ROWS}
            type="auto"
            data-overlap-scroll
        >
            <Stack gap={0}>
                {overlaps.map((overlap) => {
                    const listed = getOverlapSelection(overlap);
                    const isSelected =
                        selection !== null &&
                        isSameSelection(selection, listed);
                    return (
                        <Box
                            key={overlap.departmentUuid}
                            component="button"
                            type="button"
                            className={styles.row}
                            h={ROW_HEIGHT}
                            aria-label={getOverlapRowLabel(overlap)}
                            aria-pressed={isSelected}
                            // Choosing the chosen department again shows everyone
                            onClick={() => onSelect(isSelected ? null : listed)}
                        >
                            <Group
                                component="span"
                                justify="space-between"
                                wrap="nowrap"
                                gap="sm"
                            >
                                <Text
                                    component="span"
                                    className={styles.rowName}
                                    fz="sm"
                                    truncate="end"
                                    title={overlap.name}
                                    miw={0}
                                    flex={1}
                                >
                                    {overlap.name}
                                </Text>
                                <Text
                                    component="span"
                                    className={styles.usage}
                                    fz="xs"
                                    c="dimmed"
                                    flex="none"
                                >
                                    {formatOverlapUsage(overlap)}
                                </Text>
                            </Group>
                            <Box
                                component="span"
                                className={styles.bar}
                                data-bar
                                w={`${largest === 0 ? 0 : (100 * overlap.people) / largest}%`}
                            />
                        </Box>
                    );
                })}
            </Stack>
        </ScrollArea.Autosize>
    );
};
