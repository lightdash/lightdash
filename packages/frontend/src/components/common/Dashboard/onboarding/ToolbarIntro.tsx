import { Kbd, Text } from '@mantine/core';
import { type FC } from 'react';
import { useModKeyLabel } from '../useShortcutHints';

export const ToolbarIntro: FC = () => {
    const modKey = useModKeyLabel();
    return (
        <Text fz="sm" c="dimmed">
            Your layout tools live here. Hold <Kbd size="xs">{modKey}</Kbd> any
            time to see their shortcuts, like now.
        </Text>
    );
};
