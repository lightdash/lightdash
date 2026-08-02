import { ActionIcon } from '@mantine-8/core';
import { type Icon } from '@tabler/icons-react';
import MantineIcon from '../MantineIcon';
import classes from './ComposerSubmitButton.module.css';

type Props = {
    icon: Icon;
    label: string;
    onClick: () => void;
    size?: 'sm' | 'lg';
    disabled?: boolean;
    loading?: boolean;
    /** Renders the stop/interrupt affordance instead of the send affordance. */
    destructive?: boolean;
    /** Matches the composer's mode tint. */
    accent?: 'none' | 'indigo';
    className?: string;
};

export const ComposerSubmitButton = ({
    icon,
    label,
    onClick,
    size = 'lg',
    disabled = false,
    loading = false,
    destructive = false,
    accent = 'none',
    className,
}: Props) => (
    <ActionIcon
        variant="filled"
        size={size === 'lg' ? 'lg' : 'md'}
        className={`${classes.submitButton} ${className ?? ''}`}
        data-composer-size={size}
        data-destructive={destructive}
        data-accent={accent}
        disabled={disabled}
        loading={loading}
        onClick={onClick}
        aria-label={label}
    >
        <MantineIcon
            icon={icon}
            color="ldGray.0"
            size={size === 'lg' ? 20 : 18}
            stroke={2}
        />
    </ActionIcon>
);
