import { Button } from '@mantine/core';
import { IconMessageCircleStar } from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import MantineIcon from '../common/MantineIcon';

export const AiAgentsButton = () => {
    // Using `navigate` instead of the `Link` component to ensure round corners within a button group
    const navigate = useNavigate();

    return (
        <Button
            size="xs"
            color="gray"
            variant="default"
            fz="sm"
            leftIcon={<MantineIcon icon={IconMessageCircleStar} />}
            onClick={() => navigate('/ai-agents')}
        >
            Ask AI
        </Button>
    );
};
