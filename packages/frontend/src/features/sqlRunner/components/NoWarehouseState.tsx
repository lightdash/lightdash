import { subject } from '@casl/ability';
import { WarehouseTypes, type Project } from '@lightdash/common';
import { Box, Button, Group, Stack, Text, Title } from '@mantine/core';
import { type FC } from 'react';
import { Link } from 'react-router';
import { getWarehouseIcon } from '../../../components/ProjectConnection/ProjectConnectFlow/utils';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import classes from './NoWarehouseState.module.css';

const WAREHOUSES = [
    WarehouseTypes.BIGQUERY,
    WarehouseTypes.SNOWFLAKE,
    WarehouseTypes.DATABRICKS,
    WarehouseTypes.POSTGRES,
];

/** Shown instead of the SQL runner while a project has only live sources */
export const NoWarehouseState: FC<{ project: Project }> = ({ project }) => {
    const ability = useAbilityContext();
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
                    <Group gap={0} className={classes.logos}>
                        {WAREHOUSES.map((warehouse) => (
                            <Box key={warehouse} className={classes.logo}>
                                {getWarehouseIcon(warehouse, 'sm')}
                            </Box>
                        ))}
                    </Group>
                </Box>

                <Stack gap="xs" align="center">
                    <Title order={3}>Connect a warehouse to write SQL</Title>
                    <Text c="dimmed" size="sm">
                        {canConnect
                            ? 'The SQL runner queries your warehouse directly. Your connected tools keep working when you add one.'
                            : 'The SQL runner queries your warehouse directly. Ask a project admin to connect one.'}
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
                    <Button
                        variant="default"
                        component={Link}
                        to={`/projects/${project.projectUuid}/tables`}
                    >
                        Explore your tools
                    </Button>
                </Group>
            </Stack>
        </Box>
    );
};
