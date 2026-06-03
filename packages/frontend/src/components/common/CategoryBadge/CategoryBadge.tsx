import { Badge, Box, Tooltip } from '@mantine-8/core';
import { type FC } from 'react';
import classes from './CategoryBadge.module.css';

export type CategoryBadgeProps = {
    label: string;
    /**
     * A Mantine color reference for the accent dot. A name ('violet'), shade
     * ('orange.5') or raw CSS var all work.
     */
    color: string;
    tooltip?: string;
    /**
     * `dot` = colored dot + label in a shadcn-style chip (Autopilot/review
     * style). `token` = light filled pill.
     */
    variant?: 'dot' | 'token';
    /** Wrap the `dot` variant in a bordered chip. Defaults to true. */
    bordered?: boolean;
    /** Extra class for the chip — e.g. parent-driven hover/disabled states. */
    className?: string;
};

/**
 * Shared color-coded category badge used across the Autopilot activity feed and
 * the AI agent review queue.
 */
export const CategoryBadge: FC<CategoryBadgeProps> = ({
    label,
    color,
    tooltip,
    variant = 'dot',
    bordered = true,
    className,
}) => {
    const content =
        variant === 'token' ? (
            <Badge
                size="sm"
                radius="sm"
                variant="light"
                color={color}
                className={className}
            >
                {label}
            </Badge>
        ) : (
            <Box
                className={[
                    classes.dotBadge,
                    bordered && classes.bordered,
                    className,
                ]
                    .filter(Boolean)
                    .join(' ')}
            >
                <Box className={classes.dot} bg={color} />
                {label}
            </Box>
        );

    if (!tooltip) return content;

    return (
        <Tooltip label={tooltip} withArrow openDelay={300}>
            {content}
        </Tooltip>
    );
};
