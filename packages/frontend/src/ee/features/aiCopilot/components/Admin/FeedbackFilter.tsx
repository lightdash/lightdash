import { Box, SegmentedControl, Text, Tooltip } from '@mantine-8/core';
import { IconThumbDown, IconThumbUp } from '@tabler/icons-react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { type useAiAgentAdminFilters } from '../../hooks/useAiAgentAdminFilters';

type FeedbackFilterProps = Pick<
    ReturnType<typeof useAiAgentAdminFilters>,
    'selectedFeedback' | 'setSelectedFeedback'
>;

export const FeedbackFilter = ({
    selectedFeedback,
    setSelectedFeedback,
}: FeedbackFilterProps) => {
    const iconProps = {
        style: { display: 'block' },
        size: 18,
        stroke: 1.5,
    };
    const data = [
        {
            value: 'all',
            label: (
                <Tooltip label="Show all threads" withinPortal>
                    <Box>
                        <Text fz="xs" fw={500}>
                            All
                        </Text>
                    </Box>
                </Tooltip>
            ),
        },
        {
            value: 'thumbs_up',
            label: (
                <Tooltip
                    variant="xs"
                    label="Show only threads with positive feedback"
                    withinPortal
                    maw={200}
                >
                    <Box>
                        <MantineIcon icon={IconThumbUp} {...iconProps} />
                    </Box>
                </Tooltip>
            ),
        },
        {
            value: 'thumbs_down',
            label: (
                <Tooltip
                    variant="xs"
                    label="Show only threads with negative feedback"
                    withinPortal
                    maw={200}
                >
                    <Box pt="xxs">
                        <MantineIcon icon={IconThumbDown} {...iconProps} />
                    </Box>
                </Tooltip>
            ),
        },
    ];

    return (
        <SegmentedControl
            size="xs"
            radius="md"
            value={selectedFeedback}
            onChange={(value) =>
                setSelectedFeedback(
                    value as 'all' | 'thumbs_up' | 'thumbs_down',
                )
            }
            data={data}
        />
    );
};
