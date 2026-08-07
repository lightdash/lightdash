import { Box, Button, Group, Text } from '@mantine/core';
import { type FC } from 'react';
import classes from './AgentSettingsActionBar.module.css';

type Props = {
    mode: 'create' | 'edit';
    hasUnsavedChanges: boolean;
    isSaving: boolean;
    onSave: () => void;
    onCancel: () => void;
};

export const AgentSettingsActionBar: FC<Props> = ({
    mode,
    hasUnsavedChanges,
    isSaving,
    onSave,
    onCancel,
}) => (
    <Box className={classes.root}>
        <Group className={classes.inner} justify="space-between" gap="md">
            <Group gap="xs" align="center">
                {hasUnsavedChanges && (
                    <>
                        <Box className={classes.statusDot} />
                        <Text size="xs" c="dimmed">
                            You have unsaved changes
                        </Text>
                    </>
                )}
            </Group>
            <Group gap="xs">
                <Button
                    variant="default"
                    onClick={onCancel}
                    disabled={isSaving}
                >
                    Cancel
                </Button>
                <Button
                    onClick={onSave}
                    loading={isSaving}
                    disabled={mode === 'edit' && !hasUnsavedChanges}
                >
                    {mode === 'create' ? 'Create agent' : 'Save changes'}
                </Button>
            </Group>
        </Group>
    </Box>
);
