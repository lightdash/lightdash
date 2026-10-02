import { Anchor, Stack, Text } from '@mantine/core';
import { type FC } from 'react';

export const SharedSignInExpiredMessage: FC<{
    message: string;
    settingsHref: string | null;
    onNavigate?: () => void;
}> = ({ message, settingsHref, onNavigate }) => {
    return (
        <Stack gap={4} align="flex-start">
            <Text mb={0} fz="xs">
                {message}
            </Text>
            {settingsHref && (
                <Anchor
                    component="a"
                    href={settingsHref}
                    fz="xs"
                    fw={600}
                    onClick={onNavigate}
                >
                    Reconnect
                </Anchor>
            )}
        </Stack>
    );
};
