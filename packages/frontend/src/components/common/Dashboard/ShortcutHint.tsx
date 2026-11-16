import { Box, Group, Kbd, Text } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import { type EditShortcut } from './editShortcuts';
import classes from './ShortcutHint.module.css';
import { useModKeyLabel } from './useShortcutHints';

type ShortcutHintProps = {
    shortcut: EditShortcut;
    position: 'top' | 'corner';
    children: ReactNode;
};

/** Draws the shortcut's keys by its control while the modifier is held */
export const ShortcutHint: FC<ShortcutHintProps> = ({
    shortcut,
    position,
    children,
}) => (
    <Box className={classes.anchor}>
        {children}
        <Kbd
            size="xs"
            className={classes.hint}
            data-position={position}
            aria-hidden
        >
            {shortcut.keys.join('')}
        </Kbd>
    </Box>
);

type ShortcutTooltipLabelProps = {
    label: string;
    shortcut: EditShortcut;
};

export const ShortcutTooltipLabel: FC<ShortcutTooltipLabelProps> = ({
    label,
    shortcut,
}) => {
    const modKey = useModKeyLabel();
    return (
        <Group gap="xs" wrap="nowrap">
            <Text fz="xs" inherit>
                {label}
            </Text>
            <Group gap="xxs" wrap="nowrap">
                {[modKey, ...shortcut.keys].map((key) => (
                    <Kbd key={key} size="xs">
                        {key}
                    </Kbd>
                ))}
            </Group>
        </Group>
    );
};
