import { Button, Popover } from '@mantine/core';
import { IconCaretDown } from '@tabler/icons-react';
import React from 'react';
import MantineIcon from '../common/MantineIcon';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import BigNumberConfigTabs from './BigNumberConfigTabs';

const BigNumberConfigPanel: React.FC = () => {
    const {
        bigNumberConfig: { selectedField },
    } = useVisualizationContext();
    const disabled = !selectedField;

    return (
        <Popover
            disabled={disabled}
            position="bottom"
            shadow="md"
            withArrow
            closeOnClickOutside
            closeOnEscape
        >
            <Popover.Target>
                <Button
                    disabled={disabled}
                    variant="subtle"
                    size="xs"
                    rightIcon={<MantineIcon icon={IconCaretDown} />}
                >
                    Configure
                </Button>
            </Popover.Target>

            <Popover.Dropdown>
                <BigNumberConfigTabs />
            </Popover.Dropdown>
        </Popover>
    );
};

export default BigNumberConfigPanel;
