import { ActionIcon, Tooltip } from '@mantine/core';
import { IconMicrophone } from '@tabler/icons-react';
import { type FC } from 'react';
import { createPortal } from 'react-dom';
import MantineIcon from '../../../components/common/MantineIcon';
import { useLauncherThreadExtras } from '../aiCopilot/components/Launcher/launcherDockExtras';

/**
 * A mic in the open conversation's composer: the recording is added to that
 * conversation. Shown only while a conversation is open in the agent panel.
 */
const FollowUpMicButton: FC<{ onClick: () => void; hidden: boolean }> = ({
    onClick,
    hidden,
}) => {
    const slot = useLauncherThreadExtras();
    if (!slot || hidden) return null;
    return createPortal(
        <Tooltip label="Record a follow-up" position="top">
            <ActionIcon
                variant="subtle"
                size="md"
                aria-label="Record a follow-up"
                onClick={onClick}
            >
                <MantineIcon icon={IconMicrophone} size={16} />
            </ActionIcon>
        </Tooltip>,
        slot,
    );
};

export default FollowUpMicButton;
