import { ActionIcon, Tooltip } from '@mantine/core';
import { type FC } from 'react';
import ModeIcon from '../../../ee/features/capture/components/ModeIcon';
import {
    DESIGN_MODE_BUTTON_TOUR_ID,
    DesignModeTour,
    type DesignModeSurface,
} from '../../../ee/features/capture/onboarding';
import { type DesignModeSupport } from '../hooks/useDesignModeSupport';
import classes from './DesignModeButton.module.css';

const LABEL: Record<DesignModeSupport, string> = {
    ready: 'Design Mode',
    checking: 'Design Mode',
    'needs-update': 'This app needs updating to use Design Mode',
};

/** Turns Design Mode on and off: mark the running app and say what to change. */
const DesignModeButton: FC<{
    active: boolean;
    /** Whether the running app can be marked. */
    support: DesignModeSupport;
    onClick: () => void;
    /** Which page the button is on, for its first-run tour. */
    surface: DesignModeSurface;
}> = ({ active, support, onClick, surface }) => {
    const ready = support === 'ready';
    return (
        <>
            <Tooltip label={LABEL[support]} position="bottom">
                <ActionIcon
                    size="md"
                    variant="subtle"
                    color="gray"
                    className={classes.button}
                    onClick={ready ? onClick : undefined}
                    // Not `disabled`: a disabled button would never show the reason.
                    aria-disabled={!ready}
                    data-support={support}
                    aria-label="Design Mode"
                    aria-pressed={active}
                    data-tour={DESIGN_MODE_BUTTON_TOUR_ID}
                >
                    <ModeIcon size={16} />
                </ActionIcon>
            </Tooltip>
            {ready && (
                <DesignModeTour
                    surface={surface}
                    onTurnOn={() => {
                        if (!active) onClick();
                    }}
                />
            )}
        </>
    );
};

export default DesignModeButton;
