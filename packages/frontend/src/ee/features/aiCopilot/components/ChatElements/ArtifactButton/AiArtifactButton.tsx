import { AiResultType } from '@lightdash/common';
import { Box, Group, Loader, Title, UnstyledButton } from '@mantine-8/core';
import {
    IconChartDots3,
    IconChartHistogram,
    IconChartLine,
    IconTable,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import styles from './AiArtifactButton.module.css';

const getVizTypeIcon = (vizType: AiResultType) => {
    switch (vizType) {
        case AiResultType.TABLE_RESULT:
            return IconTable;
        case AiResultType.VERTICAL_BAR_RESULT:
            return IconChartHistogram;
        case AiResultType.TIME_SERIES_RESULT:
            return IconChartLine;
        default:
            return IconChartDots3;
    }
};

interface AiArtifactButtonProps {
    onClick: () => void;
    isLoading?: boolean;
    vizType?: AiResultType;
    title?: string;
    description?: string;
    isArtifactOpen?: boolean;
}

export const AiArtifactButton: FC<AiArtifactButtonProps> = ({
    onClick,
    isLoading = false,
    vizType,
    title,
    isArtifactOpen = false,
}) => {
    const IconComponent = vizType ? getVizTypeIcon(vizType) : IconChartDots3;

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
                            icon={IconComponent}
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
                            title && (
                                <Title order={6} fw={500}>
                                    {title}
                                </Title>
                            )
                        )}
                    </Box>
                </Group>
            </Group>
        </UnstyledButton>
    );
};
