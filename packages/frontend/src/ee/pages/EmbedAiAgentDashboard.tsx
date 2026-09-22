import { Button, Group } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import useEmbed from '../providers/Embed/useEmbed';
import EmbedDashboardPage from './EmbedDashboard';

/** A saved dashboard opened from an embedded AI conversation, read-only. */
const EmbedAiAgentDashboardPage: FC = () => {
    const { onBackToDashboard } = useEmbed();

    return (
        <>
            {onBackToDashboard && (
                <Group px="md" pt="md">
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
            <EmbedDashboardPage />
        </>
    );
};

export default EmbedAiAgentDashboardPage;
