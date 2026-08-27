import { ActionIcon, Group, Kbd, Text, Tooltip } from '@mantine-8/core';
import { useOs } from '@mantine/hooks';
import {
    IconLayoutSidebarLeftCollapse,
    IconLayoutSidebarLeftExpand,
} from '@tabler/icons-react';
import { type FC } from 'react';
import {
    explorerActions,
    useExplorerDispatch,
} from '../../features/explorer/store';
import MantineIcon from '../common/MantineIcon';

type ShortcutTooltipLabelProps = {
    action: string;
    withAlt?: boolean;
};

export const ShortcutTooltipLabel: FC<ShortcutTooltipLabelProps> = ({
    action,
    withAlt = false,
}) => {
    const os = useOs();

    return (
        <Group gap="xxs" wrap="nowrap">
            <Text fz="xs">{action}</Text>
            <Kbd size="xs" fw={600}>
                {os === 'macos' || os === 'ios' ? '⌘' : 'Ctrl'}
            </Kbd>
            {withAlt && (
                <>
                    <Text fz="xs">+</Text>
                    <Kbd size="xs" fw={600}>
                        Alt
                    </Kbd>
                </>
            )}
            <Text fz="xs">+</Text>
            <Kbd size="xs" fw={600}>
                B
            </Kbd>
        </Group>
    );
};

export const ExplorerSidebarToggle: FC<{ isOpen: boolean }> = ({ isOpen }) => {
    const dispatch = useExplorerDispatch();
    const action = isOpen ? 'Close fields sidebar' : 'Open fields sidebar';

    return (
        <Tooltip
            label={<ShortcutTooltipLabel action={action} />}
            position={isOpen ? 'left' : 'right'}
            withArrow
            withinPortal
        >
            <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={action}
                onClick={() =>
                    dispatch(explorerActions.setIsFieldSidebarOpen(!isOpen))
                }
            >
                <MantineIcon
                    icon={
                        isOpen
                            ? IconLayoutSidebarLeftCollapse
                            : IconLayoutSidebarLeftExpand
                    }
                />
            </ActionIcon>
        </Tooltip>
    );
};
