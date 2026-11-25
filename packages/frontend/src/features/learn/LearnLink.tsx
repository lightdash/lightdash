import { subject } from '@casl/ability';
import { ProjectType } from '@lightdash/common';
import { Button, Tooltip } from '@mantine/core';
import { IconSchool } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link, useNavigate } from 'react-router';
import LargeMenuItem from '../../components/common/LargeMenuItem';
import MantineIcon from '../../components/common/MantineIcon';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import { useProjects } from '../../hooks/useProjects';
import useApp from '../../providers/App/useApp';

// The library is available to permitted learners, never inside a training copy.
const useCanOpenLearn = (projectUuid: string | undefined): boolean => {
    const { user } = useApp();
    const canViewLearn =
        user.data?.ability.can(
            'view',
            subject('Learn', { organizationUuid: user.data.organizationUuid }),
        ) ?? false;
    const { data: projects } = useProjects();
    const current = projects?.find(
        (project) => project.projectUuid === projectUuid,
    );
    return (
        projectUuid !== undefined &&
        canViewLearn &&
        current?.type !== ProjectType.PREVIEW
    );
};

export const LearnMenuItem: FC = () => {
    const { activeProjectUuid } = useActiveProjectUuid();
    const canOpenLearn = useCanOpenLearn(activeProjectUuid);
    if (!canOpenLearn) return null;
    return (
        <LargeMenuItem
            component={Link}
            to={`/projects/${activeProjectUuid}/learn`}
            title="Learn"
            description="Guided walkthroughs of what you can do here."
            icon={IconSchool}
            data-tour-nav="learn"
            data-tour-hint="Choose Learn"
        />
    );
};

export const LearnLink: FC<{ projectUuid: string; withLabel?: boolean }> = ({
    projectUuid,
    withLabel = false,
}) => {
    const navigate = useNavigate();
    const canOpenLearn = useCanOpenLearn(projectUuid);
    if (!canOpenLearn) return null;
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
                {withLabel && 'Learn'}
            </Button>
        </Tooltip>
    );
};
