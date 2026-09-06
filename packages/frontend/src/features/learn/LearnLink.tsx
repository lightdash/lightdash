import { ProjectType } from '@lightdash/common';
import { Button, Tooltip } from '@mantine/core';
import { IconSchool } from '@tabler/icons-react';
import { type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../components/common/MantineIcon';
import useHealth from '../../hooks/health/useHealth';
import { useProjects } from '../../hooks/useProjects';

/**
 * Navbar entry to the library, an icon beside notifications and help;
 * present for everyone on an instance with Learn switched on, whether or
 * not the org has enabled it yet (the page says how), and never on a
 * preview (a learner's training copy included): a library opened inside a
 * copy would start walkthroughs from the wrong place.
 */
export const LearnLink: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const navigate = useNavigate();
    const { data: health } = useHealth();
    const { data: projects } = useProjects();
    const current = projects?.find(
        (project) => project.projectUuid === projectUuid,
    );
    if (!health?.learn.enabled || current?.type === ProjectType.PREVIEW)
        return null;
    return (
        <Tooltip label="Learn" position="bottom" withinPortal>
            <Button
                aria-label="Learn"
                variant="default"
                size="xs"
                onClick={() => void navigate(`/projects/${projectUuid}/learn`)}
                // Navigation anchor for scope walkthroughs (data-tour-via).
                data-tour-nav="learn"
                data-tour-hint="Click Learn"
            >
                <MantineIcon icon={IconSchool} />
            </Button>
        </Tooltip>
    );
};
