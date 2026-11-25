import { ActionIcon, Tooltip } from '@mantine/core';
import { IconPencil } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    DESIGN_MODE_BUTTON_TOUR_ID,
    DesignModeTour,
    type DesignModeSurface,
} from '../../../ee/features/capture/onboarding';

/** Turns Design Mode on and off: mark the running app and say what to change. */
const DesignModeButton: FC<{
    active: boolean;
    /** The app's bundle can take its own picture, which Design Mode needs. */
    screenshotAvailable: boolean;
    onClick: () => void;
    /** Which page the button is on, for its first-run tour. */
    surface: DesignModeSurface;
}> = ({ active, screenshotAvailable, onClick, surface }) => (
    <>
        <Tooltip
            label={
                screenshotAvailable
                    ? 'Design Mode'
                    : 'This app needs updating to use Design Mode'
            }
            position="bottom"
        >
            <ActionIcon
                size="md"
                variant={active ? 'light' : 'subtle'}
                color={active ? 'indigo' : 'gray'}
                onClick={screenshotAvailable ? onClick : undefined}
                // Not `disabled`: a disabled button would never show the reason.
                data-disabled={!screenshotAvailable || undefined}
                aria-disabled={!screenshotAvailable}
                aria-label="Design Mode"
                aria-pressed={active}
                data-tour={DESIGN_MODE_BUTTON_TOUR_ID}
            >
                <MantineIcon icon={IconPencil} size={16} />
            </ActionIcon>
        </Tooltip>
        {screenshotAvailable && (
            <DesignModeTour
                surface={surface}
                onTurnOn={() => {
                    if (!active) onClick();
                }}
            />
        )}
    </>
);

export default DesignModeButton;
