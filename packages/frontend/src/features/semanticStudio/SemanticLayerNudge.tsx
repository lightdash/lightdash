import { Box, Button, Group, Paper, Text } from '@mantine/core';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import classes from './SemanticLayerNudge.module.css';
import { TableIcon } from '../../components/common/ContentIcons';

/** For projects with views or live sources but no models: what a model adds. */
export const SemanticLayerNudge: FC<{ onBuild: () => void }> = ({
    onBuild,
}) => (
    <Paper className={classes.nudge}>
        <Group gap="sm" wrap="nowrap" miw={0}>
            <Box className={classes.nudgeIcon}>
                <MantineIcon icon={TableIcon} />
            </Box>
            <Box miw={0}>
                <Text fz="sm" fw={500}>
                    Give your team shared metrics
                </Text>
                <Text fz="xs" c="dimmed">
                    Views and live sources answer one question at a time. Models
                    give everyone the same definitions.
                </Text>
            </Box>
        </Group>
        <Button size="xs" variant="default" flex="none" onClick={onBuild}>
            Build one with the agent
        </Button>
    </Paper>
);
