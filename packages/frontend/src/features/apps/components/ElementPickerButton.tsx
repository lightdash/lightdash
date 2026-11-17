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
    /** Styled for the app builder's preview header. */
    inHeader?: boolean;
}> = ({ enabled, onToggle, disabled, inHeader = false }) => (
    <Tooltip
        label={
            enabled
                ? 'Element picker on – click an element in the preview'
                : 'Pick an element in the preview to reference it'
        }
        position={inHeader ? 'bottom' : 'top'}
    >
        <ActionIcon
            variant={enabled ? (inHeader ? 'default' : 'light') : 'subtle'}
            color={enabled && !inHeader ? 'indigo' : 'gray'}
            size="md"
            radius={inHeader ? undefined : 'xl'}
            onClick={onToggle}
            disabled={disabled}
            aria-label="Toggle element picker"
            aria-pressed={enabled}
        >
            <MantineIcon icon={IconClick} size={16} />
        </ActionIcon>
    </Tooltip>
);
