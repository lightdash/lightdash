import { type AiAgentMessageAssistant } from '@lightdash/common';
import { Box, Group, Loader, Title, UnstyledButton } from '@mantine-8/core';
import { IconChartDots3 } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import styles from './AiArtifactButton.module.css';

interface AiArtifactButtonProps {
    onClick: () => void;
    isArtifactOpen: boolean;
    artifact: AiAgentMessageAssistant['artifact'];
    isLoading?: boolean;
}

export const AiArtifactButton: FC<AiArtifactButtonProps> = ({
    onClick,
    isLoading = false,
    isArtifactOpen = false,
    artifact,
}) => {
    const displayTitle = artifact?.title;

    return (
        <UnstyledButton
            className={styles.artifactButton}
            artifact-open={isArtifactOpen ? 'true' : undefined}
            onClick={onClick}
            disabled={isLoading}
        >
            <Group className={styles.container}>
                <Group className={styles.content}>
                    {isLoading ? (
                        <Loader
                            size={14}
                            color="gray"
                            className={styles.icon}
                        />
                    ) : (
                        <MantineIcon
                            icon={IconChartDots3}
                            size={14}
                            color="gray"
                            className={styles.icon}
                        />
                    )}
                    <Box className={styles.text}>
                        {isLoading ? (
                            <Title
                                order={6}
                                c="dimmed"
                                tt="uppercase"
                                size="xs"
                            >
                                Loading...
                            </Title>
                        ) : (
                            displayTitle && (
                                <Title order={6} fw={500}>
                                    {displayTitle}
                                </Title>
                            )
                        )}
                    </Box>
                </Group>
            </Group>
        </UnstyledButton>
    );
};
