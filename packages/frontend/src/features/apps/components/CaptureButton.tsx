import { ActionIcon, Tooltip } from '@mantine/core';
import { IconMicrophone } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

/** Starts a capture: draw on the running app while talking. */
const CaptureButton: FC<{
    label: string;
    onClick: () => void;
    disabled: boolean;
}> = ({ label, onClick, disabled }) => (
    <Tooltip label={label} position="bottom">
        <ActionIcon
            size="md"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
        >
            <MantineIcon icon={IconMicrophone} size={16} />
        </ActionIcon>
    </Tooltip>
);

export default CaptureButton;
