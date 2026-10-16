import { subject } from '@casl/ability';
import { FeatureFlags, ProjectType } from '@lightdash/common';
import { Button, Tooltip } from '@mantine/core';
import { IconSchool } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import MantineIcon from '../../components/common/MantineIcon';
import { useProjects } from '../../hooks/useProjects';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';

// The library is available to permitted learners, never inside a training copy.
export const LearnLink: FC<{ projectUuid: string; withLabel?: boolean }> = ({
    projectUuid,
    withLabel = false,
}) => {
    const { t } = useTranslation('learn');
    const navigate = useNavigate();
    const { user } = useApp();
    const canViewLearn = user.data?.ability.can(
        'view',
        subject('Learn', { organizationUuid: user.data.organizationUuid }),
    );
    const { data: learnFlag } = useServerFeatureFlag(FeatureFlags.EnableLearn);
    const { data: projects } = useProjects();
    const current = projects?.find(
        (project) => project.projectUuid === projectUuid,
    );
    if (
        !learnFlag?.enabled ||
        !canViewLearn ||
        current?.type === ProjectType.PREVIEW
    )
        return null;
    return (
        <Tooltip label={t('link.label')} position="bottom" withinPortal>
            <Button
                aria-label={t('link.label')}
                variant="default"
                size="xs"
                onClick={() => void navigate(`/projects/${projectUuid}/learn`)}
                // Navigation anchor for scope walkthroughs (data-tour-via).
                data-tour-nav="learn"
                data-tour-hint="Click Learn"
            >
                <MantineIcon icon={IconSchool} />
                {withLabel && t('link.label')}
            </Button>
        </Tooltip>
    );
};
