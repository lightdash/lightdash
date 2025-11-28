import {
    assertUnreachable,
    type AiAgentMessageAssistant,
} from '@lightdash/common';
import { Box, Loader, Text, UnstyledButton } from '@mantine-8/core';
import {
    IconArtboard,
    IconChartBar,
    IconLayoutDashboard,
} from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import styles from './AiArtifactButton.module.css';

interface AiArtifactButtonProps {
    onClick: () => void;
    isArtifactOpen: boolean;
    artifact: NonNullable<AiAgentMessageAssistant['artifacts']>[0] | null;
    isLoading?: boolean;
}

export const AiArtifactButton: FC<AiArtifactButtonProps> = ({
    onClick,
    isLoading = false,
    isArtifactOpen = false,
    artifact,
}) => {
    const displayTitle = artifact?.title;

    const ArtifactIcon = useMemo(() => {
        if (!artifact) return IconArtboard;

        switch (artifact.artifactType) {
            case 'chart':
                return IconChartBar;
            case 'dashboard':
                return IconLayoutDashboard;
            default:
                return assertUnreachable(
                    artifact.artifactType,
                    `invalid artifact type ${artifact.artifactType}`,
                );
        }
    }, [artifact]);

    return (
        <UnstyledButton
            className={styles.artifactButton}
            data-artifact-open={isArtifactOpen}
            data-loading={isLoading}
            onClick={onClick}
            disabled={isLoading}
        >
            <Box className={styles.container}>
                {isLoading ? (
                    <Loader size={14} color="ldGray.5" />
                ) : (
                    <MantineIcon
                        icon={ArtifactIcon}
                        size={14}
                        className={styles.icon}
                    />
                )}

                <Box className={styles.content}>
                    {isLoading ? (
                        <Text size="sm" c="dimmed">
                            Creating...
                        </Text>
                    ) : (
                        displayTitle && (
                            <Text size="sm" fw={500} className={styles.title}>
                                {displayTitle}
                            </Text>
                        )
                    )}
                </Box>
            </Box>
        </UnstyledButton>
    );
};
