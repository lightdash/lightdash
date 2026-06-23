import { Anchor, Center, Group, Text } from '@mantine-8/core';
import { IconArrowLeft, IconTool } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import { useNavigate } from 'react-router';
import { useUpdateActiveProjectMutation } from '../../hooks/useActiveProject';
import MantineIcon from '../common/MantineIcon';
import { BANNER_HEIGHT } from '../common/Page/constants';
import classes from './PreviewBanner.module.css';

const formatExpirationSuffix = (expiresAt: Date): string => {
    const expiresAtDate = new Date(expiresAt);
    const diffMs = expiresAtDate.getTime() - Date.now();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const formatted = expiresAtDate.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
    if (diffDays <= 0) return ` Expires today (${formatted}).`;
    if (diffDays === 1) return ` Expires in 1 day (${formatted}).`;
    return ` Expires in ${diffDays} days (${formatted}).`;
};

export const PreviewBanner: FC<{
    expiresAt: Date | null;
    upstreamProject: { projectUuid: string; name: string } | null;
}> = ({ expiresAt, upstreamProject }) => {
    const navigate = useNavigate();
    const { mutate: setActiveProject } = useUpdateActiveProjectMutation();

    const handleBackToUpstream = useCallback(() => {
        if (!upstreamProject) return;
        setActiveProject(upstreamProject.projectUuid);
        void navigate(`/projects/${upstreamProject.projectUuid}/home`);
    }, [navigate, setActiveProject, upstreamProject]);

    return (
        <Center
            id="preview-banner"
            pos="fixed"
            top={0}
            w="100%"
            h={BANNER_HEIGHT}
            bg="blue.6"
            className={classes.banner}
            px="md"
        >
            <Group gap="xs" wrap="nowrap" miw={0}>
                <MantineIcon icon={IconTool} color="white" size="sm" />
                <Text c="white" fw={500} fz="xs" truncate>
                    This is a preview environment. Any changes you make here will
                    not affect production.
                    {expiresAt && formatExpirationSuffix(expiresAt)}
                </Text>
                {upstreamProject && (
                    <Anchor
                        component="button"
                        type="button"
                        onClick={handleBackToUpstream}
                        c="white"
                        fz="xs"
                        fw={600}
                        underline="always"
                        className={classes.backLink}
                    >
                        <MantineIcon icon={IconArrowLeft} size="sm" />
                        <Text span>back to</Text>
                        <Text span truncate maw={200}>
                            {upstreamProject.name}
                        </Text>
                    </Anchor>
                )}
            </Group>
        </Center>
    );
};
