import { Box, Button, Popover } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import React from 'react';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import {
    COLLAPSABLE_CARD_BUTTON_PROPS,
    COLLAPSABLE_CARD_POPOVER_PROPS,
} from '../../common/CollapsableCard/constants';
import MantineIcon from '../../common/MantineIcon';
import { ConfigTabs } from './PieChartConfigTabs';

const PieChartConfig: React.FC = () => {
    const { resultsData } = useVisualizationContext();
    const disabled = !resultsData;

    return (
        <Popover {...COLLAPSABLE_CARD_POPOVER_PROPS} disabled={disabled}>
            <Popover.Target>
                <Button
                    {...COLLAPSABLE_CARD_BUTTON_PROPS}
                    disabled={disabled}
                    rightIcon={
                        <MantineIcon icon={IconChevronDown} color="gray" />
                    }
                >
                    Configure
                </Button>
            </Popover.Target>

            <Popover.Dropdown w={320}>
                <Box w={320}>
                    <ConfigTabs />
                </Box>
            </Popover.Dropdown>
        </Popover>
    );
};

export default PieChartConfig;
