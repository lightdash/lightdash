import { Button, Menu, PopoverPosition } from '@blueprintjs/core';
import { MenuItem2, Popover2, Tooltip2 } from '@blueprintjs/popover2';
import { AdditionalMetric, fieldId } from '@lightdash/common';
import React, { FC, ReactNode, useMemo } from 'react';
import { useExplorer } from '../../../../../providers/ExplorerProvider';
import { useTracking } from '../../../../../providers/TrackingProvider';
import { EventName } from '../../../../../types/Events';

const CustomMetricButtons: FC<{
    node: AdditionalMetric;
    isHovered: boolean;
    isSelected: boolean;
}> = ({ node, isHovered, isSelected }) => {
    const { track } = useTracking();

    const {
        actions: { removeAdditionalMetric },
    } = useExplorer();

    const menuItems = useMemo<ReactNode[]>(() => {
        return [
            <MenuItem2
                key="custommetric"
                icon="delete"
                text="Remove custom metric"
                onClick={(e) => {
                    e.stopPropagation();
                    track({
                        name: EventName.REMOVE_CUSTOM_METRIC_CLICKED,
                    });
                    removeAdditionalMetric(fieldId(node));
                }}
            />,
        ];
    }, [removeAdditionalMetric, node, track]);

    return (
        <div
            style={{
                display: 'inline-flex',
                gap: '10px',
            }}
        >
            {menuItems.length > 0 && (isHovered || isSelected) && (
                <Popover2
                    content={<Menu>{menuItems}</Menu>}
                    autoFocus={false}
                    position={PopoverPosition.BOTTOM_LEFT}
                    minimal
                    lazy
                    interactionKind="click"
                    renderTarget={({ isOpen, ref, ...targetProps }) => (
                        <Tooltip2 content="View options">
                            <Button
                                {...targetProps}
                                elementRef={ref === null ? undefined : ref}
                                icon="more"
                                minimal
                                onClick={(e) => {
                                    (targetProps as any).onClick(e);
                                    e.stopPropagation();
                                }}
                            />
                        </Tooltip2>
                    )}
                />
            )}
        </div>
    );
};

export default CustomMetricButtons;
