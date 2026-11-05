import {
    assertUnreachable,
    type AiAgentMessageAssistant,
} from '@lightdash/common';
import { Box, Loader, Text, UnstyledButton } from '@mantine/core';
import {
    IconArtboard,
    IconChartBar,
    IconChevronRight,
    IconLayoutDashboard,
} from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { useUiStrings } from '../../../../../providers/Embed/useUiStrings';
import styles from './AiArtifactButton.module.css';
import { getArtifactCardMeta, getArtifactTypeLabel } from './artifactCardMeta';
import { type ArtifactType } from './pendingArtifact';

interface AiArtifactButtonProps {
    onClick: () => void;
    isArtifactOpen: boolean;
    artifact: NonNullable<AiAgentMessageAssistant['artifacts']>[0] | null;
    isLoading?: boolean;
    isTurnFinishing?: boolean;
    isRevision?: boolean;
}

export const AiArtifactButton: FC<AiArtifactButtonProps> = ({
    onClick,
    isLoading = false,
    isArtifactOpen = false,
    isTurnFinishing = false,
    isRevision = false,
    artifact,
}) => {
    const getUiString = useUiStrings();
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
                            <>
                                <Text className={styles.title}>
                                    {displayTitle}
                                </Text>
                                <Text className={styles.meta}>
                                    {getArtifactCardMeta(
                                        {
                                            artifactType:
                                                artifact?.artifactType ??
                                                'chart',
                                            isRevision,
                                            isArtifactOpen,
                                            isTurnFinishing,
                                        },
                                        getUiString,
                                    )}
                                </Text>
                            </>
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

/** Holds the card's slot while the tool that lands it is still running. */
export const AiArtifactPendingCard: FC<{ artifactType: ArtifactType }> = ({
    artifactType,
}) => {
    const getUiString = useUiStrings();
    const typeLabel = getArtifactTypeLabel(artifactType, getUiString);
    return (
        <Box
            className={styles.artifactButton}
            data-pending="true"
            role="status"
        >
            <Box className={styles.container}>
                <Box className={styles.iconChip}>
                    <Loader size={12} color="ldGray.5" />
                </Box>
                <Box className={styles.content}>
                    <Text className={styles.loadingLabel}>{typeLabel}</Text>
                    <Text className={styles.meta}>
                        {getUiString('aiAgent.artifact.pending.building')}
                    </Text>
                </Box>
            </Box>
        </Box>
    );
};
