import { Group, Text } from '@mantine-8/core';
import {
    useCallback,
    useEffect,
    type FC,
    type MouseEvent,
    type ReactNode,
    type SVGProps,
} from 'react';
import styles from './MetricCatalogColumnHeaderCell.module.css';

let tooltipElement: HTMLDivElement | null = null;

const getTooltipElement = () => {
    if (!tooltipElement) {
        tooltipElement = document.createElement('div');
        tooltipElement.className = styles.floatingTooltip;
        document.body.appendChild(tooltipElement);
    }

    return tooltipElement;
};

const hideTooltip = () => {
    tooltipElement?.remove();
    tooltipElement = null;
};

const showTooltip = (label: string, target: HTMLElement) => {
    const element = getTooltipElement();
    const rect = target.getBoundingClientRect();

    element.textContent = label;
    element.style.left = `${rect.left}px`;
    element.style.top = `${rect.bottom + 8}px`;

    const tooltipRect = element.getBoundingClientRect();
    const overflowRight = tooltipRect.right - window.innerWidth + 8;

    if (overflowRight > 0) {
        element.style.left = `${Math.max(8, rect.left - overflowRight)}px`;
    }
};

export const MetricCatalogColumnHeaderCell = ({
    children,
    disabled,
    Icon,
    tooltipLabel,
}: {
    children: ReactNode;
    disabled?: boolean;
    tooltipLabel?: string;
    Icon: FC<SVGProps<SVGSVGElement>>;
}) => {
    const handleShowTooltip = useCallback(
        (event: MouseEvent<HTMLElement>) => {
            if (!tooltipLabel || disabled) return;

            showTooltip(tooltipLabel, event.currentTarget);
        },
        [disabled, tooltipLabel],
    );

    useEffect(() => {
        if (disabled) hideTooltip();

        return hideTooltip;
    }, [disabled]);

    return (
        <Group
            gap={6}
            h="100%"
            mr={6}
            onBlur={hideTooltip}
            onFocus={handleShowTooltip}
            onMouseDown={hideTooltip}
            onMouseEnter={handleShowTooltip}
            onMouseLeave={hideTooltip}
            wrap="nowrap"
        >
            <Icon />
            <Text fz="xs" fw={600} c="ldGray.7" className={styles.noSelect}>
                {children}
            </Text>
        </Group>
    );
};
