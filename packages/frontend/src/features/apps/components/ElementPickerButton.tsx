import { ActionIcon, Tooltip } from '@mantine/core';
import { IconClick } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

/**
 * Toggles the element picker on a preview. Render it only once the preview's
 * SDK has announced picker availability.
 */
export const ElementPickerButton: FC<{
    enabled: boolean;
    onToggle: () => void;
    disabled?: boolean;
}> = ({ enabled, onToggle, disabled }) => (
    <Tooltip
        label={
            enabled
                ? 'Element picker on – click an element in the preview'
                : 'Pick an element in the preview to reference it'
        }
        position="top"
    >
        <ActionIcon
            variant={enabled ? 'light' : 'subtle'}
            color={enabled ? 'indigo' : 'gray'}
            size="md"
            radius="xl"
            onClick={onToggle}
            disabled={disabled}
            aria-label="Toggle element picker"
            aria-pressed={enabled}
        >
            <MantineIcon icon={IconClick} size={16} />
        </ActionIcon>
    </Tooltip>
);
