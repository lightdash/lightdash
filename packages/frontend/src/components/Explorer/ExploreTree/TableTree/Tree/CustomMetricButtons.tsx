import { AdditionalMetric, fieldId } from '@lightdash/common';
import { ActionIcon, Box, Menu, Tooltip } from '@mantine/core';
import { IconDots, IconTrash } from '@tabler/icons-react';
import { FC } from 'react';
import { useExplorerContext } from '../../../../../providers/ExplorerProvider';
import { useTracking } from '../../../../../providers/TrackingProvider';
import { EventName } from '../../../../../types/Events';
import MantineIcon from '../../../../common/MantineIcon';

const CustomMetricButtons: FC<{
    node: AdditionalMetric;
    isHovered: boolean;
    isSelected: boolean;
}> = ({ node, isHovered, isSelected }) => {
    const { track } = useTracking();
    const removeAdditionalMetric = useExplorerContext(
        (context) => context.actions.removeAdditionalMetric,
    );

    return isHovered || isSelected ? (
        <Menu withArrow withinPortal shadow="lg" position="bottom-end">
            <Menu.Target>
                <ActionIcon size="sm" h="md">
                    <Tooltip label="View options">
                        <MantineIcon icon={IconDots} />
                    </Tooltip>
                </ActionIcon>
            </Menu.Target>

            <Menu.Dropdown>
                <Menu.Item
                    color="red"
                    key="custommetric"
                    icon={<MantineIcon icon={IconTrash} />}
                    onClick={() => {
                        // e.stopPropagation();
                        track({
                            name: EventName.REMOVE_CUSTOM_METRIC_CLICKED,
                        });
                        removeAdditionalMetric(fieldId(node));
                    }}
                >
                    Remove custom metric
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    ) : null;
};

export default CustomMetricButtons;
