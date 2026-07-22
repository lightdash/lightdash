import { CloseButton } from '@mantine-8/core';
import { type ComponentPropsWithoutRef, type FC } from 'react';
import classes from './TagPill.module.css';

export type TagPillSize = 'xs' | 'sm' | 'md';

const closeButtonSizes: Record<TagPillSize, number> = {
    xs: 16,
    sm: 22,
    md: 24,
};

export type TagPillProps = {
    label: string;
    onRemove?: () => void;
    disabled?: boolean;
    readOnly?: boolean;
    size?: TagPillSize;
} & Omit<ComponentPropsWithoutRef<'div'>, 'children'>;

export const TagPill: FC<TagPillProps> = ({
    label,
    onRemove,
    disabled = false,
    readOnly = false,
    size = 'sm',
    className,
    ...others
}) => {
    const isStatic = disabled || readOnly || !onRemove;

    return (
        <div
            className={
                className ? `${classes.root} ${className}` : classes.root
            }
            data-size={size}
            data-disabled={disabled || undefined}
            data-static={isStatic || undefined}
            {...others}
        >
            <span className={classes.label}>{label}</span>

            {!isStatic && (
                <CloseButton
                    aria-hidden
                    onMouseDown={onRemove}
                    size={closeButtonSizes[size]}
                    radius={2}
                    variant="transparent"
                    iconSize="70%"
                    className={classes.remove}
                    tabIndex={-1}
                />
            )}
        </div>
    );
};
