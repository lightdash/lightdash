import { Box, Button, Popover } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import {
    COLLAPSABLE_CARD_BUTTON_PROPS,
    COLLAPSABLE_CARD_POPOVER_PROPS,
} from '../../common/CollapsableCard';
import MantineIcon from '../../common/MantineIcon';
import { isCartesianVisualizationConfig } from '../../LightdashVisualization/VisualizationConfigCartesian';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import { ConfigTabs } from './ConfigTabs';

const ChartConfigPanel: React.FC = () => {
    const { resultsData, visualizationConfig } = useVisualizationContext();

    if (!isCartesianVisualizationConfig(visualizationConfig)) return null;

    const { chartConfig } = visualizationConfig;

    const disabled =
        !resultsData ||
        resultsData?.rows.length === 0 ||
        !chartConfig.validConfig;

    return (
        <Popover
            withinPortal={true}
            {...COLLAPSABLE_CARD_POPOVER_PROPS}
            disabled={disabled}
        >
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
                <Box w={335}>
                    <ConfigTabs />
                </Box>
            </Popover.Dropdown>
        </Popover>
    );
};

export default ChartConfigPanel;
