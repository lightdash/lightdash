import { Box, Button, Stack, Text } from '@mantine/core';
import { type PropsWithChildren } from 'react';
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
    const { pathname } = useLocation();
    const authoringEnabled = useContentAuthoringEnabled();
    const editorRoute = EDITOR_PATHS.some((path) => matchPath(path, pathname));

    if (!authoringEnabled && editorRoute) {
        return (
            <Box p="lg">
                <Stack align="flex-start">
                    <Text fw={600}>Editing isn’t available on phones</Text>
                    <Text c="dimmed">
                        Open Lightdash on a desktop or tablet to create or edit
                        charts and dashboards.
                    </Text>
                    <Button component={Link} to="/" variant="default">
                        Back to home
                    </Button>
                </Stack>
            </Box>
        );
    }

    return children;
};
