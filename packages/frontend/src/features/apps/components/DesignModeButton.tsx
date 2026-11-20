import { ActionIcon, Tooltip } from '@mantine/core';
import { IconPencil } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

/** Turns Design Mode on and off: mark the running app and say what to change. */
const DesignModeButton: FC<{
    active: boolean;
    /** The app's bundle can take its own picture, which Design Mode needs. */
    screenshotAvailable: boolean;
    onClick: () => void;
}> = ({ active, screenshotAvailable, onClick }) => (
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
        >
            <MantineIcon icon={IconPencil} size={16} />
        </ActionIcon>
    </Tooltip>
);

export default DesignModeButton;
