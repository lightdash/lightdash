import { ActionIcon, Divider, Group, Text, Tooltip } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import { createPortal } from 'react-dom';
import MantineIcon from '../../components/common/MantineIcon';
import { selectActiveTabUuid, useDashboardSelector } from '../dashboard/store';
import classes from './FieldTilesBar.module.css';
import { FloatingBar } from './FloatingBar';
import {
    SelectionActions,
    type SelectionActionsProps,
} from './SelectionActions';
import { useBarHost } from './useBarHost';

type Props = SelectionActionsProps & { onClear: () => void };

// Floats over the tiles, where the field bar does, while pills are picked on
// the sectioned bar
export const SelectionBar: FC<Props> = ({ onClear, ...actions }) => {
    const count =
        actions.filterCount + actions.parameterCount + actions.dateZoomCount;
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);
    const host = useBarHost(activeTabUuid, true);
    if (host === null) return null;
    return createPortal(
        <FloatingBar role="region" aria-label="Selected controls">
            <Group gap="sm" justify="center">
                <Group gap="xs" wrap="nowrap">
                    <Text fz="sm" fw={600} className={classes.count}>
                        {count} selected
                    </Text>
                    {count === 1 && (
                        <Text fz="sm" c="dimmed">
                            Shift click for a range
                        </Text>
                    )}
                </Group>
                <Divider
                    orientation="vertical"
                    color="var(--mantine-color-default-border)"
                />
                <Group gap="xs" wrap="nowrap">
                    <SelectionActions {...actions} />
                    <Tooltip label="Clear selection">
                        <ActionIcon
                            size="md"
                            aria-label="Clear selection"
                            onClick={onClear}
                        >
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            </Group>
        </FloatingBar>,
        host,
    );
};
