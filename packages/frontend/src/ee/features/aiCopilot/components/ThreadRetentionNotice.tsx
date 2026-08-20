import {
    FeatureFlags,
    getEffectiveRetentionWindowHours,
    type RetentionWindowHours,
} from '@lightdash/common';
import { Group, Text } from '@mantine/core';
import { IconHourglass } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import { useAiOrganizationSettings } from '../hooks/useAiOrganizationSettings';
import { formatRetentionHours } from '../utils/threadRetention';

type Props = {
    agentThreadRetentionHours: RetentionWindowHours;
};

export const ThreadRetentionNotice: FC<Props> = ({
    agentThreadRetentionHours,
}) => {
    const flag = useServerFeatureFlag(FeatureFlags.AiThreadRetention);
    const settingsQuery = useAiOrganizationSettings();

    if (!flag.data?.enabled) return null;
    // An in-flight ceiling reads as "no ceiling", which would briefly show
    // an un-capped window — render nothing until the ceiling is known.
    if (!settingsQuery.isSuccess) return null;

    const effectiveHours = getEffectiveRetentionWindowHours(
        agentThreadRetentionHours,
        settingsQuery.data.threadRetentionHours ?? null,
    );
    if (effectiveHours === null) return null;

    return (
        <Group gap={4} wrap="nowrap">
            <MantineIcon icon={IconHourglass} size={14} color="ldGray.6" />
            <Text size="xs" c="ldGray.6">
                Conversations are deleted after{' '}
                {formatRetentionHours(effectiveHours)} of inactivity
            </Text>
        </Group>
    );
};
