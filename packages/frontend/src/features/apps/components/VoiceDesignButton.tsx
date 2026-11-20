import { ActionIcon, Tooltip } from '@mantine/core';
import { IconMicrophone } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    VOICE_DESIGN_BUTTON_TOUR_ID,
    VoiceDesignTour,
} from '../../../ee/features/capture/onboarding';

/** Starts a Voice Design recording: draw on the running app while talking. */
const VoiceDesignButton: FC<{
    onClick: () => void;
    disabled: boolean;
}> = ({ onClick, disabled }) => (
    <>
        <Tooltip label="Voice Design" position="bottom">
            <ActionIcon
                size="md"
                onClick={onClick}
                disabled={disabled}
                aria-label="Voice Design"
                data-tour={VOICE_DESIGN_BUTTON_TOUR_ID}
            >
                <MantineIcon icon={IconMicrophone} size={16} />
            </ActionIcon>
        </Tooltip>
        <VoiceDesignTour surface="app" />
    </>
);

export default VoiceDesignButton;
