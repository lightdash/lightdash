import { Anchor, Center, Group, Text } from '@mantine/core';
import { IconArrowLeft, IconTool } from '@tabler/icons-react';
import { type TFunction } from 'i18next';
import { useCallback, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useUpdateActiveProjectMutation } from '../../hooks/useActiveProject';
import { getProjectUrlIdentifier } from '../../utils/projectUrl';
import MantineIcon from '../common/MantineIcon';
import { BANNER_HEIGHT } from '../common/Page/constants';
import classes from './PreviewBanner.module.css';

const formatExpirationSuffix = (
    t: TFunction<'navigation'>,
    expiresAt: Date,
): string => {
    const expiresAtDate = new Date(expiresAt);
    const diffMs = expiresAtDate.getTime() - Date.now();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const formatted = expiresAtDate.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
    if (diffDays <= 0)
        return ` ${t('previewBanner.expiresToday', { date: formatted })}`;
    return ` ${t('previewBanner.expiresIn', { count: diffDays, date: formatted })}`;
};

export const PreviewBanner: FC<{
    expiresAt: Date | null;
    upstreamProject: {
        projectUuid: string;
        slug?: string;
        name: string;
    } | null;
}> = ({ expiresAt, upstreamProject }) => {
    const { t } = useTranslation('navigation');
    const navigate = useNavigate();
    const { mutate: setActiveProject } = useUpdateActiveProjectMutation();

    const handleBackToUpstream = useCallback(() => {
        if (!upstreamProject) return;
        setActiveProject(upstreamProject.projectUuid);
        void navigate(
            `/projects/${getProjectUrlIdentifier(upstreamProject)}/home`,
        );
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
                    {t('previewBanner.message')}
                    {expiresAt && formatExpirationSuffix(t, expiresAt)}
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
                        <Text span fz="xs" fw={600} truncate maw={200}>
                            {t('previewBanner.backTo', {
                                name: upstreamProject.name,
                            })}
                        </Text>
                    </Anchor>
                )}
            </Group>
        </Center>
    );
};
