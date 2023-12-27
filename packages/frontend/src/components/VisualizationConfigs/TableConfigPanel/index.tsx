import { Box, Button, Popover } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import React from 'react';
import MantineIcon from '../../common/MantineIcon';

import {
    COLLAPSABLE_CARD_BUTTON_PROPS,
    COLLAPSABLE_CARD_POPOVER_PROPS,
} from '../../../constants';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider/useVisualizationContext';
import TableConfigTabs from './TableConfigTabs';

const TableConfigPanel: React.FC = () => {
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

            <Popover.Dropdown>
                <Box w={320}>
                    <TableConfigTabs />
                </Box>
            </Popover.Dropdown>
        </Popover>
    );
};

export default TableConfigPanel;
