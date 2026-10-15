import { Box, Button, Stack, Text } from '@mantine/core';
import { type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, matchPath, useLocation } from 'react-router';
import { useContentAuthoringEnabled } from '../../../hooks/useContentAuthoringEnabled';

const EDITOR_PATHS = [
    '/projects/:projectUuid/tables/*',
    '/projects/:projectUuid/saved/:chartUuid/edit',
    '/projects/:projectUuid/dashboards/:dashboardUuid/edit/*',
    '/projects/:projectUuid/sql-runner',
    '/projects/:projectUuid/sql-runner/:slug/edit',
];

export const ContentAuthoringRoute = ({ children }: PropsWithChildren) => {
    const { t } = useTranslation('commonUi');
    const { pathname } = useLocation();
    const authoringEnabled = useContentAuthoringEnabled();
    const editorRoute = EDITOR_PATHS.some((path) => matchPath(path, pathname));

    if (!authoringEnabled && editorRoute) {
        return (
            <Box p="lg">
                <Stack align="flex-start">
                    <Text fw={600}>
                        {t('projectLayout.editingUnavailableTitle')}
                    </Text>
                    <Text c="dimmed">
                        {t('projectLayout.editingUnavailableDescription')}
                    </Text>
                    <Button component={Link} to="/" variant="default">
                        {t('projectLayout.backToHome')}
                    </Button>
                </Stack>
            </Box>
        );
    }

    return children;
};
