import { Box, SegmentedControl, Text, Tooltip } from '@mantine-8/core';
import { IconBrandSlack, IconMessageCircleStar } from '@tabler/icons-react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import classes from './SourceFilter.module.css';

type SourceFilterProps = {
    selectedSource: 'all' | 'web_app' | 'slack';
    setSelectedSource: (source: 'all' | 'web_app' | 'slack') => void;
};

export const SourceFilter = ({
    selectedSource,
    setSelectedSource,
}: SourceFilterProps) => {
    const iconProps = {
        style: { display: 'block' },
        size: 18,
        stroke: 1.5,
    };
    const data = [
        {
            label: (
                <Tooltip withinPortal variant="xs" label="All sources">
                    <Box>
                        <Text fz="xs" fw={500}>
                            All
                        </Text>
                    </Box>
                </Tooltip>
            ),
            value: 'all',
        },
        {
            label: (
                <Tooltip withinPortal variant="xs" label="Web app threads">
                    <Box>
                        <MantineIcon
                            icon={IconMessageCircleStar}
                            {...iconProps}
                        />
                    </Box>
                </Tooltip>
            ),
            value: 'web_app',
        },
        {
            label: (
                <Tooltip withinPortal variant="xs" label="Slack threads">
                    <Box>
                        <MantineIcon icon={IconBrandSlack} {...iconProps} />
                    </Box>
                </Tooltip>
            ),
            value: 'slack',
        },
    ];
    return (
        <SegmentedControl
            size="xs"
            value={selectedSource}
            onChange={(value) =>
                setSelectedSource(value as 'all' | 'web_app' | 'slack')
            }
            classNames={{
                root: classes.segmentedControl,
                indicator: classes.indicator,
                label: classes.label,
            }}
            data={data}
        />
    );
};
