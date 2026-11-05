import { Button, Text, Tooltip } from '@mantine/core';
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
        <Button
            variant={enabled ? 'default' : 'subtle'}
            color="gray"
            size="xs"
            radius="xl"
            h="auto"
            px={8}
            py={6}
            onClick={onToggle}
            disabled={disabled}
            aria-label="Toggle element picker"
            aria-pressed={enabled}
            leftSection={<MantineIcon icon={IconClick} size={14} />}
        >
            <Text
                span
                size="xs"
                fw={600}
                lh={1.2}
                c="inherit"
                data-composer-label
            >
                Select element
            </Text>
        </Button>
    </Tooltip>
);
