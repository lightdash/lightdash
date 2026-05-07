import { type AiAgentSummary } from '@lightdash/common';
import { Button } from '@mantine-8/core';
import { IconMessageCircleStar } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';

type Props = {
    agent: AiAgentSummary | null;
    onClick: () => void;
};

export const LauncherPill: FC<Props> = ({ agent, onClick }) => (
    <Button
        size="xs"
        variant="default"
        radius="xl"
        fz="sm"
        leftSection={
            <MantineIcon icon={IconMessageCircleStar} color="ldGray.6" />
        }
        onClick={onClick}
        aria-label={agent ? `Ask ${agent.name}` : 'Ask AI'}
    >
        Ask AI
    </Button>
);
