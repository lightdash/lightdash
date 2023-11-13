import { ChartType } from '@lightdash/common';
import { Box, Button, Popover } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import React from 'react';
import {
    COLLAPSABLE_CARD_BUTTON_PROPS,
    COLLAPSABLE_CARD_POPOVER_PROPS,
} from '../../common/CollapsableCard';
import MantineIcon from '../../common/MantineIcon';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import BigNumberConfigTabs from './BigNumberConfigTabs';

const BigNumberConfig: React.FC = () => {
    const { visualizationConfig } = useVisualizationContext();

    const isBigNumber = visualizationConfig?.chartType === ChartType.BIG_NUMBER;

    if (!isBigNumber) return null;

    const disabled = !visualizationConfig.chartConfig.selectedField;

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

            <Popover.Dropdown>
                <Box w={320}>
                    <BigNumberConfigTabs />
                </Box>
            </Popover.Dropdown>
        </Popover>
    );
};

export default BigNumberConfig;
