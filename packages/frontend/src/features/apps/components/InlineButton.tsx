import { ActionIcon, Tooltip } from '@mantine/core';
import { IconMicrophone } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

/** Starts an Inline recording: draw on the running app while talking. */
const InlineButton: FC<{
    onClick: () => void;
    disabled: boolean;
}> = ({ onClick, disabled }) => (
    <Tooltip label="Voice Design" position="bottom">
        <ActionIcon
            size="md"
            onClick={onClick}
            disabled={disabled}
            aria-label="Voice Design"
        >
            <MantineIcon icon={IconMicrophone} size={16} />
        </ActionIcon>
    </Tooltip>
);

export default InlineButton;
