import { type AiUserThreadCreatedFrom } from '@lightdash/common';
import { Box, SegmentedControl, Text, Tooltip } from '@mantine/core';
import {
    IconApi,
    IconBrandSlack,
    IconMessageCircleStar,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { type useAiAgentAdminFilters } from '../../hooks/useAiAgentAdminFilters';

type SourceFilterProps = Pick<
    ReturnType<typeof useAiAgentAdminFilters>,
    'selectedSource' | 'setSelectedSource'
>;

export const SourceFilter = ({
    selectedSource,
    setSelectedSource,
}: SourceFilterProps) => {
    const { t } = useTranslation('aiCopilotAdmin');
    const iconProps = {
        style: { display: 'block' },
        size: 18,
        stroke: 1.5,
    };
    const data = [
        {
            label: (
                <Tooltip label={t('filters.source.allTooltip')}>
                    <Box>
                        <Text fz="xs" fw={500}>
                            {t('filters.source.all')}
                        </Text>
                    </Box>
                </Tooltip>
            ),
            value: 'all',
        },
        {
            label: (
                <Tooltip label={t('filters.source.webApp')}>
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
                <Tooltip label={t('filters.source.slack')}>
                    <Box>
                        <MantineIcon icon={IconBrandSlack} {...iconProps} />
                    </Box>
                </Tooltip>
            ),
            value: 'slack',
        },
        {
            label: (
                <Tooltip label={t('filters.source.api')}>
                    <Box>
                        <MantineIcon icon={IconApi} {...iconProps} />
                    </Box>
                </Tooltip>
            ),
            value: 'api',
        },
    ];
    return (
        <SegmentedControl
            size="xs"
            value={selectedSource}
            onChange={(value) =>
                setSelectedSource(value as 'all' | AiUserThreadCreatedFrom)
            }
            data={data}
        />
    );
};
