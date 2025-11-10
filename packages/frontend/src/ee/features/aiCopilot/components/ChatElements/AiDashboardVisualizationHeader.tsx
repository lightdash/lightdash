import type { AiArtifact, ToolDashboardArgs } from '@lightdash/common';
import { ActionIcon, Group, Stack, Text, Title } from '@mantine-8/core';
import { useMediaQuery } from '@mantine-8/hooks';
import { IconX } from '@tabler/icons-react';
import type { FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { AiDashboardQuickOptions } from './AiDashboardQuickOptions';

type Props = {
    projectUuid: string;
    agentUuid: string;
    artifactData: AiArtifact;
    dashboardConfig: ToolDashboardArgs;
    showCloseButton?: boolean;
    onClose?: () => void;
};

export const AiDashboardVisualizationHeader: FC<Props> = ({
    projectUuid,
    agentUuid,
    artifactData,
    dashboardConfig,
    showCloseButton = true,
    onClose,
}) => {
    const isMobile = useMediaQuery('(max-width: 768px)');

    return (
        <Group gap="md" align="start">
            <Stack gap={0} flex={1}>
                <Title order={5}>{dashboardConfig.title}</Title>
                {dashboardConfig.description && (
                    <Text c="dimmed" size="xs">
                        {dashboardConfig.description}
                    </Text>
                )}
            </Stack>
            <Group gap="sm" display={isMobile ? 'none' : 'flex'}>
                <AiDashboardQuickOptions
                    artifactData={artifactData}
                    projectUuid={projectUuid}
                    agentUuid={agentUuid}
                    dashboardConfig={dashboardConfig}
                />
                {showCloseButton && onClose && (
                    <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="gray"
                        onClick={onClose}
                    >
                        <MantineIcon icon={IconX} color="gray" />
                    </ActionIcon>
                )}
            </Group>
        </Group>
    );
};
