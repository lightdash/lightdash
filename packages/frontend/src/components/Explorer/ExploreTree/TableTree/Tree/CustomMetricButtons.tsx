import { Menu, PopoverPosition } from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import { AdditionalMetric, fieldId } from '@lightdash/common';
import { ActionIcon, Tooltip } from '@mantine/core';
import { IconDots } from '@tabler/icons-react';
import { FC, ReactNode, useMemo } from 'react';
import { useExplorerContext } from '../../../../../providers/ExplorerProvider';
import { useTracking } from '../../../../../providers/TrackingProvider';
import { EventName } from '../../../../../types/Events';
import MantineIcon from '../../../../common/MantineIcon';
import { ItemOptions } from '../TableTree.styles';

const CustomMetricButtons: FC<{
    node: AdditionalMetric;
    isHovered: boolean;
    isSelected: boolean;
}> = ({ node, isHovered, isSelected }) => {
    const { track } = useTracking();
    const removeAdditionalMetric = useExplorerContext(
        (context) => context.actions.removeAdditionalMetric,
    );

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
        <ItemOptions>
            {menuItems.length > 0 && (isHovered || isSelected) && (
                <Popover2
                    content={<Menu>{menuItems}</Menu>}
                    autoFocus={false}
                    position={PopoverPosition.BOTTOM_RIGHT}
                    minimal
                    lazy
                    interactionKind="click"
                    renderTarget={({ isOpen, ref, ...targetProps }) => (
                        <Tooltip label="View options">
                            <ActionIcon
                                {...targetProps}
                                ref={ref}
                                onClick={(e) => {
                                    (targetProps as any).onClick(e);
                                    e.stopPropagation();
                                }}
                            >
                                <MantineIcon icon={IconDots} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                />
            )}
        </ItemOptions>
    );
};

export default CustomMetricButtons;
