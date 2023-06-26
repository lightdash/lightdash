import { Button, Popover } from '@mantine/core';
import { IconCaretDown } from '@tabler/icons-react';
import React from 'react';
import MantineIcon from '../common/MantineIcon';
import PieLayoutConfig from './PieChartLayoutConfig';

const PieChartConfig: React.FC = () => {
    return (
        <Popover position="bottom" shadow="xl" withArrow keepMounted={false}>
            <Popover.Target>
                <Button
                    variant="subtle"
                    color="gray"
                    size="xs"
                    rightIcon={<MantineIcon icon={IconCaretDown} />}
                >
                    Configure
                </Button>
            </Popover.Target>

            <Popover.Dropdown>
                <PieLayoutConfig />
            </Popover.Dropdown>
        </Popover>
    );
};

export default PieChartConfig;
