import { Box, Button, Group, Text } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import classes from './AgentSettingsActionBar.module.css';

type Props = {
    mode: 'create' | 'edit';
    hasUnsavedChanges: boolean;
    isSaving: boolean;
    onSave: () => void;
    onCancel: () => void;
};

/**
 * Walkthrough action for manage:AiAgent: creating an agent from its setup
 * page; the agent's own page is the result.
 */
const createTourAction = {
    'data-tour-scope': 'manage:AiAgent',
    'data-tour-step': '2',
    'data-tour-route': '/projects/:projectUuid/ai-agents/new',
    'data-tour-label': 'Click Create agent',
    'data-tour-title': 'Create and configure an AI agent',
    'data-tour-interactive': 'true',
    'data-tour-via':
        '[data-tour-nav="ask-ai"] >> [data-tour-anchor="agent-selector"] >> [data-tour-anchor="agent-new"] >> [data-tour-anchor="agent-name"] >> [data-tour-anchor="agent-instructions"]',
    'data-tour-docs':
        'agents/set-up-agents.mdx#user-and-group-access-optional:1',
};

export const AgentSettingsActionBar: FC<Props> = ({
    mode,
    hasUnsavedChanges,
    isSaving,
    onSave,
    onCancel,
}) => {
    const { t } = useTranslation('aiAgent');
    return (
        <Box className={classes.root}>
            <Group className={classes.inner} justify="space-between" gap="md">
                <Group gap="xs" align="center">
                    {hasUnsavedChanges && (
                        <>
                            <Box className={classes.statusDot} />
                            <Text size="xs" c="dimmed">
                                {t('actionBar.unsavedChanges')}
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
                        {t('actions.cancel', { ns: 'common' })}
                    </Button>
                    <Button
                        onClick={onSave}
                        loading={isSaving}
                        disabled={mode === 'edit' && !hasUnsavedChanges}
                        {...(mode === 'create' ? createTourAction : {})}
                    >
                        {mode === 'create'
                            ? t('actionBar.createAgent')
                            : t('actionBar.saveChanges')}
                    </Button>
                </Group>
            </Group>
        </Box>
    );
};
