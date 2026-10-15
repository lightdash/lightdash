import { type AiAgentReviewItemSummary } from '@lightdash/common';
import { Anchor, Box, Stack, Text } from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import styles from './IssueDetailModal.module.css';

type Props = {
    item: AiAgentReviewItemSummary & { source: 'memory' };
    projectUuid: string | null;
};

export const MemoryProvenance: FC<Props> = ({ item, projectUuid }) => {
    const { t } = useTranslation('aiCopilotAdmin');
    const sourceMemoryProjectUuid = item.projectUuid ?? projectUuid;
    const nominationReason = item.nominationReason ?? item.description;
    const nominator =
        item.nominator?.name ??
        item.nominator?.email ??
        t('memoryProvenance.unknownUser');

    return (
        <Stack gap="md" className={styles.evidenceSection}>
            <Text className={styles.sectionLabel}>
                {t('memoryProvenance.title')}
            </Text>
            <Stack gap="sm">
                <Box>
                    <Text fz="xs" fw={600} c="dimmed">
                        {t('memoryProvenance.nominationReason')}
                    </Text>
                    <Text fz="sm">{nominationReason}</Text>
                </Box>
                <Box>
                    <Text fz="xs" fw={600} c="dimmed">
                        {t('memoryProvenance.nominatedBy')}
                    </Text>
                    <Text fz="sm">{nominator}</Text>
                </Box>
                {item.sourceMemory && sourceMemoryProjectUuid ? (
                    <Anchor
                        component={Link}
                        to={`/projects/${sourceMemoryProjectUuid}/ai-agents/memories/${item.sourceMemory.slug}`}
                        className={styles.toggle}
                    >
                        {t('memoryProvenance.viewSource')}
                        <MantineIcon
                            icon={IconArrowRight}
                            size={13}
                            stroke={1.5}
                        />
                    </Anchor>
                ) : (
                    <Text fz="sm" c="dimmed">
                        {t('memoryProvenance.sourceUnavailable')}
                    </Text>
                )}
            </Stack>
        </Stack>
    );
};
