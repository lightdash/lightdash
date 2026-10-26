import { ActionIcon, Divider, Group, Paper, Text } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import { createPortal } from 'react-dom';
import MantineIcon from '../../components/common/MantineIcon';
import { selectActiveTabUuid, useDashboardSelector } from '../dashboard/store';
import classes from './FieldTilesBar.module.css';
import {
    SelectionActions,
    type SelectionActionsProps,
} from './SelectionActions';
import { useBarHost } from './useBarHost';

type Props = SelectionActionsProps & { onClear: () => void };

// Floats over the tiles, where the field bar does, while pills are picked on
// the sectioned bar
export const SelectionBar: FC<Props> = ({ onClear, ...actions }) => {
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);
    const host = useBarHost(activeTabUuid, true);
    if (host === null) return null;
    return createPortal(
        <Paper
            role="region"
            aria-label="Selected filters"
            shadow="md"
            radius="md"
            className={classes.bar}
        >
            <Group gap="md" justify="center">
                <Group gap="xs" wrap="nowrap">
                    <Text fz="sm" fw={600} className={classes.count}>
                        {actions.count} selected
                    </Text>
                    <Text fz="xs" c="dimmed">
                        Shift click for a range
                    </Text>
                </Group>
                <Divider orientation="vertical" />
                <Group gap="xs" wrap="nowrap">
                    <SelectionActions {...actions} menuPosition="top" />
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="sm"
                        aria-label="Clear selection"
                        onClick={onClear}
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                </Group>
            </Group>
        </Paper>,
        host,
    );
};
