import { Button, Group, Stack } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import clsx from 'clsx';
import { type CSSProperties, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import useEmbed from '../providers/Embed/useEmbed';
import styles from './EmbedAiAgentDashboard.module.css';
import EmbedDashboardPage from './EmbedDashboard';

// The dashboard scrolls below the back bar instead of taking a full viewport
const DASHBOARD_CONTAINER_STYLES: CSSProperties = {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
};

/** A saved dashboard opened from an embedded AI conversation, read-only. */
const EmbedAiAgentDashboardPage: FC = () => {
    const { onBackToDashboard, mode } = useEmbed();

    return (
        <Stack
            gap={0}
            className={clsx(styles.page, mode === 'sdk' && styles.sdkPage)}
        >
            {onBackToDashboard && (
                <Group px="md" pt="md" flex="0 0 auto">
                    <Button
                        variant="subtle"
                        color="gray"
                        size="xs"
                        leftSection={<MantineIcon icon={IconArrowLeft} />}
                        onClick={onBackToDashboard}
                    >
                        Back to AI
                    </Button>
                </Group>
            )}
            <EmbedDashboardPage containerStyles={DASHBOARD_CONTAINER_STYLES} />
        </Stack>
    );
};

export default EmbedAiAgentDashboardPage;
