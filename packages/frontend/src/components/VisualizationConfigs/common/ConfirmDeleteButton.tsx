import { ActionIcon, Tooltip, type ActionIconProps } from '@mantine-8/core';
import { useTimeout } from '@mantine-8/hooks';
import {
    useCallback,
    useEffect,
    useState,
    type FC,
    type KeyboardEvent,
    type MouseEvent,
    type ReactNode,
} from 'react';

type Props = {
    onConfirm: () => void;
    children: ReactNode;
    tooltip?: string;
    /**
     * Timeout in miliseconds that will auto-disarm after first click
     */
    timeoutMs?: number;
    'aria-label': string;
} & Omit<ActionIconProps, 'children' | 'onClick' | 'color' | 'variant'>;

/**
 * Two-click confirm delete button.
 * First click arms (variant change + tooltip) and second click fires onConfirm
 * Auto-disarms on mouse leave, blur, escape or after `timeoutMs`
 */
export const ConfirmDeleteButton: FC<Props> = ({
    onConfirm,
    children,
    tooltip = 'Click again to delete',
    timeoutMs = 3000,
    'aria-label': ariaLabel,
    ...actionIconProps
}) => {
    const [armed, setArmed] = useState(false);
    const { start, clear } = useTimeout(() => setArmed(false), timeoutMs);

    const disarm = useCallback(() => {
        clear();
        setArmed(false);
    }, [clear]);

    useEffect(() => clear, [clear]);

    const handleClick = (e: MouseEvent) => {
        e.stopPropagation();
        if (armed) {
            disarm();
            onConfirm();
            return;
        }
        setArmed(true);
        start();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') disarm();
    };

    return (
        <Tooltip
            label={tooltip}
            opened={armed}
            withArrow
            position="top"
            withinPortal
        >
            <ActionIcon
                {...actionIconProps}
                aria-label={ariaLabel}
                aria-pressed={armed}
                color={armed ? 'red' : 'gray'}
                variant={armed ? 'filled' : 'subtle'}
                onClick={handleClick}
                onMouseLeave={disarm}
                onBlur={disarm}
                onKeyDown={handleKeyDown}
            >
                {children}
            </ActionIcon>
        </Tooltip>
    );
};
