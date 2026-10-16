import { Box, SegmentedControl, Text, Tooltip } from '@mantine/core';
import { IconThumbDown, IconThumbUp } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('aiCopilotAdmin');
    const iconProps = {
        style: { display: 'block' },
        size: 18,
        stroke: 1.5,
    };
    const data = [
        {
            value: 'all',
            label: (
                <Tooltip label={t('filters.feedback.allTooltip')}>
                    <Box>
                        <Text fz="xs" fw={500}>
                            {t('filters.feedback.all')}
                        </Text>
                    </Box>
                </Tooltip>
            ),
        },
        {
            value: 'thumbs_up',
            label: (
                <Tooltip label={t('filters.feedback.positive')} maw={200}>
                    <Box>
                        <MantineIcon icon={IconThumbUp} {...iconProps} />
                    </Box>
                </Tooltip>
            ),
        },
        {
            value: 'thumbs_down',
            label: (
                <Tooltip label={t('filters.feedback.negative')} maw={200}>
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
