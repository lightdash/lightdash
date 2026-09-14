import { Group, Text } from '@mantine/core';
import {
    useCallback,
    useEffect,
    type FC,
    type ReactNode,
    type SVGProps,
    type SyntheticEvent,
} from 'react';
import { usePortalTarget } from '../../../providers/PortalTarget/usePortalTarget';
import styles from './MetricCatalogColumnHeaderCell.module.css';

let tooltipElement: HTMLDivElement | null = null;

// Appended to the portal target rather than document.body: in the SDK the
// Mantine variables the tooltip is styled with only exist inside that container.
const getTooltipElement = (container: HTMLElement) => {
    if (!tooltipElement) {
        tooltipElement = document.createElement('div');
        tooltipElement.className = styles.floatingTooltip;
        container.appendChild(tooltipElement);
    }

    return tooltipElement;
};

const hideTooltip = () => {
    tooltipElement?.remove();
    tooltipElement = null;
};

const showTooltip = (
    label: string,
    target: HTMLElement,
    container: HTMLElement,
) => {
    const element = getTooltipElement(container);
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
    const portalTarget = usePortalTarget();
    const handleShowTooltip = useCallback(
        (event: SyntheticEvent<HTMLElement>) => {
            if (!tooltipLabel || disabled) return;

            showTooltip(tooltipLabel, event.currentTarget, portalTarget);
        },
        [disabled, portalTarget, tooltipLabel],
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
