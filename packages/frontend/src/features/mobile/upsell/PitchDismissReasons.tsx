import { Button, Group, Stack, Title } from '@mantine/core';
import { useId, type FC } from 'react';
import {
    MOBILE_PITCH_DISMISS_REASONS,
    MOBILE_PITCH_DISMISS_STRINGS,
    type MobilePitchDismissReason,
} from './pitchDismiss';

export const PitchDismissReasons: FC<{
    onPick: (reason: MobilePitchDismissReason) => void;
}> = ({ onPick }) => {
    const titleId = useId();
    return (
        <Stack gap="sm">
            <Title order={5} id={titleId}>
                {MOBILE_PITCH_DISMISS_STRINGS.title}
            </Title>
            <Group gap="xs" role="group" aria-labelledby={titleId}>
                {MOBILE_PITCH_DISMISS_REASONS.map((reason, index) => (
                    <Button
                        key={reason}
                        variant="default"
                        radius="xl"
                        size="xs"
                        autoFocus={index === 0}
                        onClick={() => onPick(reason)}
                    >
                        {MOBILE_PITCH_DISMISS_STRINGS.reasons[reason]}
                    </Button>
                ))}
            </Group>
        </Stack>
    );
};
