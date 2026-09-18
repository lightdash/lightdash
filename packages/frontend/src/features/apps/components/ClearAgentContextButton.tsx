import { ActionIcon, Stack, Text, Tooltip } from '@mantine/core';
import { IconEraser } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {
    /** A build is running: clearing is refused until it lands. */
    disabled: boolean;
    onClick: () => void;
};

/** Starts a fresh thread; sits top-right of the builder's chat box. */
const ClearAgentContextButton: FC<Props> = ({ disabled, onClick }) => (
    <Tooltip
        position="top"
        openDelay={200}
        transitionProps={{ transition: 'fade', duration: 150 }}
        label={
            <Stack gap={0}>
                <Text fz="xs" fw={500}>
                    Clear agent context
                </Text>
                <Text fz="xs" fw={400}>
                    Start a fresh conversation with agent
                </Text>
            </Stack>
        }
    >
        {/* data-disabled keeps the tooltip reachable while disabled. */}
        <ActionIcon
            aria-label="Clear agent context"
            aria-disabled={disabled || undefined}
            data-disabled={disabled || undefined}
            onClick={disabled ? undefined : onClick}
        >
            <MantineIcon icon={IconEraser} />
        </ActionIcon>
    </Tooltip>
);

export default ClearAgentContextButton;
