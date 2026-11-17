import { Group, Kbd, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { type EditShortcut } from '../editShortcuts';
import { useModKeyLabel } from '../useShortcutHints';

type ShortcutListProps = {
    intro: string;
    shortcuts: { label: string; shortcut: EditShortcut }[];
};

export const ShortcutList: FC<ShortcutListProps> = ({ intro, shortcuts }) => {
    const modKey = useModKeyLabel();
    return (
        <Stack gap="sm">
            <Text fz="sm" c="dimmed">
                {intro}
            </Text>
            <Stack gap="xxs">
                {shortcuts.map(({ label, shortcut }) => (
                    <Group key={label} justify="space-between" wrap="nowrap">
                        <Text fz="xs">{label}</Text>
                        <Group gap="xxs" wrap="nowrap">
                            {[modKey, ...shortcut.keys].map((key) => (
                                <Kbd key={key} size="xs">
                                    {key}
                                </Kbd>
                            ))}
                        </Group>
                    </Group>
                ))}
            </Stack>
        </Stack>
    );
};

export const ShortcutHintsIntro: FC = () => {
    const modKey = useModKeyLabel();
    return (
        <Text fz="sm" c="dimmed">
            Everything you need to lay out a dashboard now lives in this bar.
            Every tool has a shortcut. Hold <Kbd size="xs">{modKey}</Kbd> at any
            time to see them all.
        </Text>
    );
};
