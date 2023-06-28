import { Button, Popover } from '@mantine/core';
import React from 'react';
import {
    COLLAPSABLE_CARD_BUTTON_PROPS,
    COLLAPSABLE_CARD_POPOVER_PROPS,
} from '../common/CollapsableCard';
import PieLayoutConfig from './PieChartLayoutConfig';

const PieChartConfig: React.FC = () => {
    return (
        <Popover
            {...COLLAPSABLE_CARD_POPOVER_PROPS}
            // TODO: remove once blueprint migration is complete
            zIndex={15}
            closeOnClickOutside={false}
        >
            <Popover.Target>
                <Button {...COLLAPSABLE_CARD_BUTTON_PROPS}>Configure</Button>
            </Popover.Target>

            <Popover.Dropdown>
                <PieLayoutConfig />
            </Popover.Dropdown>
        </Popover>
    );
};

export default PieChartConfig;
