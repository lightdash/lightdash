import { Button } from '@mantine-8/core';
import { IconAppWindow } from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import { useActiveProject } from '../../hooks/useActiveProject';
import useApp from '../../providers/App/useApp';
import MantineIcon from '../common/MantineIcon';

export const BuildAppButton = () => {
    const navigate = useNavigate();
    const { data: projectUuid } = useActiveProject();
    const { health } = useApp();

    if (!health.data?.dataApps.enabled) {
        return null;
    }

    return (
        <Button
            size="xs"
            variant="default"
            fz="sm"
            leftSection={<MantineIcon icon={IconAppWindow} color="ldGray.6" />}
            onClick={() => navigate(`/projects/${projectUuid}/apps/generate`)}
        >
            Build App
        </Button>
    );
};
