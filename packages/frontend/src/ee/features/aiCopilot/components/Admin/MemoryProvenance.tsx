import { type AiAgentReviewItemSummary } from '@lightdash/common';
import { Anchor, Box, Stack, Text } from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import styles from './IssueDetailModal.module.css';

type Props = {
    item: AiAgentReviewItemSummary & { source: 'memory' };
    projectUuid: string | null;
};

export const MemoryProvenance: FC<Props> = ({ item, projectUuid }) => {
    const sourceMemoryProjectUuid = item.projectUuid ?? projectUuid;
    const nominationReason = item.nominationReason ?? item.description;
    const nominator =
        item.nominator?.name ?? item.nominator?.email ?? 'Unknown user';

    return (
        <Stack gap="md" className={styles.evidenceSection}>
            <Text className={styles.sectionLabel}>Memory provenance</Text>
            <Stack gap="sm">
                <Box>
                    <Text fz="xs" fw={600} c="dimmed">
                        Nomination reason
                    </Text>
                    <Text fz="sm">{nominationReason}</Text>
                </Box>
                <Box>
                    <Text fz="xs" fw={600} c="dimmed">
                        Nominated by
                    </Text>
                    <Text fz="sm">{nominator}</Text>
                </Box>
                {item.sourceMemory && sourceMemoryProjectUuid ? (
                    <Anchor
                        component={Link}
                        to={`/projects/${sourceMemoryProjectUuid}/ai-agents/memories/${item.sourceMemory.slug}`}
                        className={styles.toggle}
                    >
                        View source memory
                        <MantineIcon
                            icon={IconArrowRight}
                            size={13}
                            stroke={1.5}
                        />
                    </Anchor>
                ) : (
                    <Text fz="sm" c="dimmed">
                        Source memory unavailable
                    </Text>
                )}
            </Stack>
        </Stack>
    );
};
