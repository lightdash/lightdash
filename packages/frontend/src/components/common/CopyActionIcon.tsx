import {
    ActionIcon,
    CopyButton,
    Tooltip,
    type ActionIconProps,
    type ElementProps,
    type TooltipProps,
} from '@mantine/core';
import { IconCheck, IconCopy, type Icon } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from './MantineIcon';

type CopyActionIconProps = Omit<ActionIconProps, 'children'> &
    Omit<ElementProps<'button'>, 'children' | 'color' | 'onClick' | 'value'> & {
        value: string;
        copyLabel?: string;
        copiedLabel?: string;
        icon?: Icon;
        tooltipPosition?: TooltipProps['position'];
    };

export const CopyActionIcon: FC<CopyActionIconProps> = ({
    value,
    copyLabel = 'Copy',
    copiedLabel = 'Copied',
    icon = IconCopy,
    tooltipPosition,
    color,
    ...rest
}) => (
    <CopyButton value={value}>
        {({ copied, copy }) => (
            <Tooltip
                label={copied ? copiedLabel : copyLabel}
                position={tooltipPosition}
            >
                <ActionIcon
                    color={copied ? 'teal' : color}
                    onClick={copy}
                    aria-label={copyLabel}
                    {...rest}
                >
                    <MantineIcon icon={copied ? IconCheck : icon} />
                </ActionIcon>
            </Tooltip>
        )}
    </CopyButton>
);
