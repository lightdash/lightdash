import { Popover2 } from '@blueprintjs/popover2';
import { Button } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import React from 'react';
import { COLLAPSABLE_CARD_BUTTON_PROPS } from '../common/CollapsableCard';
import MantineIcon from '../common/MantineIcon';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import BigNumberConfigTabs from './BigNumberConfigTabs';

const BigNumberConfigPanel: React.FC = () => {
    const {
        bigNumberConfig: { selectedField },
    } = useVisualizationContext();
    const disabled = !selectedField;

    return (
        <Popover2
            disabled={disabled}
            position="bottom"
            content={<BigNumberConfigTabs />}
        >
            <Button
                {...COLLAPSABLE_CARD_BUTTON_PROPS}
                disabled={disabled}
                rightIcon={<MantineIcon icon={IconChevronDown} color="gray" />}
            >
                Configure
            </Button>
        </Popover2>
    );
};

export default BigNumberConfigPanel;
