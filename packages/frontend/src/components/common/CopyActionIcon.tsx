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
import { useTranslation } from 'react-i18next';
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
    copyLabel,
    copiedLabel,
    icon = IconCopy,
    tooltipPosition,
    color,
    ...rest
}) => {
    const { t } = useTranslation('common');
    const resolvedCopyLabel = copyLabel ?? t('actions.copy');
    const resolvedCopiedLabel = copiedLabel ?? t('feedback.copiedShort');
    return (
        <CopyButton value={value}>
            {({ copied, copy }) => (
                <Tooltip
                    label={copied ? resolvedCopiedLabel : resolvedCopyLabel}
                    position={tooltipPosition}
                >
                    <ActionIcon
                        color={copied ? 'teal' : color}
                        onClick={copy}
                        aria-label={resolvedCopyLabel}
                        {...rest}
                    >
                        <MantineIcon icon={copied ? IconCheck : icon} />
                    </ActionIcon>
                </Tooltip>
            )}
        </CopyButton>
    );
};
