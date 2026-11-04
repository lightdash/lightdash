import { subject } from '@casl/ability';
import { type Project } from '@lightdash/common';
import { Box, Button, Group, Stack, Text, Title } from '@mantine/core';
import { type FC } from 'react';
import { Link } from 'react-router';
import { WarehouseLogoStack } from '../../../components/ProjectConnection/ProjectConnectFlow/WarehouseLogoStack';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import { useExternalConnections } from '../../externalConnections/hooks/useExternalConnections';
import classes from './NoWarehouseState.module.css';

/** Shown instead of the SQL runner while a project has only live sources */
export const NoWarehouseState: FC<{ project: Project }> = ({ project }) => {
    const ability = useAbilityContext();
    const { data: connections } = useExternalConnections(project.projectUuid);
    const hasTools = (connections ?? []).some(
        ({ kind }) => kind === 'live_source',
    );
    const canConnect = ability.can(
        'update',
        subject('Project', {
            organizationUuid: project.organizationUuid,
            projectUuid: project.projectUuid,
        }),
    );

    return (
        <Box className={classes.root}>
            <Stack align="center" gap="xl" maw={440} ta="center">
                <Box className={classes.editor} aria-hidden>
                    <Group gap={5} className={classes.editorBar}>
                        <span className={classes.dot} />
                        <span className={classes.dot} />
                        <span className={classes.dot} />
                    </Group>
                    <Box className={classes.code}>
                        <div>
                            <span className={classes.keyword}>select</span> *
                        </div>
                        <div>
                            <span className={classes.keyword}>from</span>{' '}
                            <span className={classes.placeholder}>
                                your_warehouse
                            </span>
                            <span className={classes.cursor} />
                        </div>
                    </Box>
                    <Box className={classes.logos}>
                        <WarehouseLogoStack size="md" monochrome={false} />
                    </Box>
                </Box>

                <Stack gap="xs" align="center">
                    <Title order={3}>Connect a warehouse to write SQL</Title>
                    <Text c="dimmed" size="sm">
                        The SQL runner queries your warehouse directly.{' '}
                        {!canConnect
                            ? 'Ask a project admin to connect one.'
                            : hasTools
                              ? 'Your connected tools keep working when you add one.'
                              : 'Add its credentials in project settings to start.'}
                    </Text>
                </Stack>

                <Group gap="sm" justify="center">
                    {canConnect && (
                        <Button
                            component={Link}
                            to={`/generalSettings/projectManagement/${project.projectUuid}/settings`}
                        >
                            Connect a warehouse
                        </Button>
                    )}
                    {hasTools && (
                        <Button
                            variant="default"
                            component={Link}
                            to={`/projects/${project.projectUuid}/tables`}
                        >
                            Explore your tools
                        </Button>
                    )}
                </Group>
            </Stack>
        </Box>
    );
};
