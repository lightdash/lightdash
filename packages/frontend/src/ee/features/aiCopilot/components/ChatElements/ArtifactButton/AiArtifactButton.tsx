import {
    assertUnreachable,
    type AiAgentMessageAssistant,
} from '@lightdash/common';
import { Box, Loader, Text, UnstyledButton } from '@mantine-8/core';
import {
    IconArtboard,
    IconChartBar,
    IconChevronRight,
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
                <Box className={styles.iconChip}>
                    {isLoading ? (
                        <Loader size={12} color="ldGray.5" />
                    ) : (
                        <MantineIcon
                            icon={ArtifactIcon}
                            size={14}
                            stroke={1.5}
                            className={styles.icon}
                        />
                    )}
                </Box>

                <Box className={styles.content}>
                    {isLoading ? (
                        <Text className={styles.loadingLabel}>Creating…</Text>
                    ) : (
                        displayTitle && (
                            <Text className={styles.title}>{displayTitle}</Text>
                        )
                    )}
                </Box>

                {!isLoading && (
                    <MantineIcon
                        icon={IconChevronRight}
                        size={14}
                        className={styles.chevron}
                    />
                )}
            </Box>
        </UnstyledButton>
    );
};
