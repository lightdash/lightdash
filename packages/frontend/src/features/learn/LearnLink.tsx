import { FeatureFlags, ProjectType } from '@lightdash/common';
import { Button, Tooltip } from '@mantine/core';
import { IconSchool } from '@tabler/icons-react';
import { type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../components/common/MantineIcon';
import { useProjects } from '../../hooks/useProjects';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';

/**
 * Navbar entry to the library, an icon beside notifications and help;
 * present for everyone in an org with the Learn flag on, whether or
 * not the training project exists yet (the page says how), and never on a
 * preview (a learner's training copy included): a library opened inside a
 * copy would start walkthroughs from the wrong place.
 */
export const LearnLink: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const navigate = useNavigate();
    const { data: learnFlag } = useServerFeatureFlag(FeatureFlags.EnableLearn);
    const { data: projects } = useProjects();
    const current = projects?.find(
        (project) => project.projectUuid === projectUuid,
    );
    if (!learnFlag?.enabled || current?.type === ProjectType.PREVIEW)
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
