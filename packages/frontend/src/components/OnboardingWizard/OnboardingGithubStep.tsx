import { Alert, Button, Group, Loader, Stack, Text } from '@mantine/core';
import {
    IconAlertCircle,
    IconBrandGithub,
    IconCheck,
    IconExternalLink,
} from '@tabler/icons-react';
import { type FC, useEffect, useState } from 'react';
import { useAbilityContext } from '../../providers/Ability/useAbilityContext';
import { useGithubConfig } from '../common/GithubIntegration/hooks/useGithubIntegration';
import MantineIcon from '../common/MantineIcon';

const GITHUB_INSTALL_URL = '/api/v1/github/install';
const POLL_INTERVAL_MS = 3000;

type Props = {
    onComplete: () => void;
};

export const OnboardingGithubStep: FC<Props> = ({ onComplete }) => {
    const ability = useAbilityContext();

    // Use config endpoint - much faster than fetching all repos
    const {
        data: githubConfig,
        isLoading,
        isError,
        refetch,
    } = useGithubConfig();

    // GitHub is installed if we get config back (not loading, not error)
    const isGithubInstalled =
        !isLoading && !isError && githubConfig?.enabled === true;

    // Use GitIntegration ability
    const canManageGitIntegration = ability.can('manage', 'GitIntegration');

    // Track if OAuth flow has been started (user clicked Connect GitHub)
    const [hasStartedOAuth, setHasStartedOAuth] = useState(false);

    // Poll for GitHub installation status after user starts OAuth flow
    useEffect(() => {
        if (isGithubInstalled || !hasStartedOAuth) return;

        const interval = setInterval(() => {
            void refetch();
        }, POLL_INTERVAL_MS);

        return () => clearInterval(interval);
    }, [isGithubInstalled, hasStartedOAuth, refetch]);

    // Auto-advance when GitHub is detected as installed
    useEffect(() => {
        if (isGithubInstalled) {
            onComplete();
        }
    }, [isGithubInstalled, onComplete]);

    // Show loading state while checking GitHub installation
    if (isLoading) {
        return (
            <Stack spacing="md" align="center" py="xl">
                <Loader size="md" />
                <Text color="dimmed">Checking GitHub connection...</Text>
            </Stack>
        );
    }

    // Already connected - show success state and auto-advance
    if (isGithubInstalled) {
        return (
            <Stack spacing="md">
                <Group>
                    <MantineIcon icon={IconCheck} color="green" size="lg" />
                    <div>
                        <Text fw={500}>GitHub Connected</Text>
                        <Text size="sm" color="dimmed">
                            Your organization is connected to GitHub
                        </Text>
                    </div>
                </Group>
                <Button onClick={onComplete}>Continue</Button>
            </Stack>
        );
    }

    // User doesn't have permission to manage Git integration
    if (!canManageGitIntegration) {
        return (
            <Alert
                icon={<IconAlertCircle size={16} />}
                color="yellow"
                title="Permission required"
            >
                <Text size="sm">
                    You don't have permission to manage Git integrations. Please
                    contact your organization admin to complete this step.
                </Text>
            </Alert>
        );
    }

    const handleConnectGithub = () => {
        setHasStartedOAuth(true);
        window.open(GITHUB_INSTALL_URL, '_blank');
    };

    // Not connected - show install button (opens in new tab)
    return (
        <Stack spacing="md">
            <Text>
                Connect Lightdash to GitHub to sync your dbt project and enable
                version control.
            </Text>
            <Button
                onClick={handleConnectGithub}
                leftIcon={<IconBrandGithub size={18} />}
                rightIcon={<IconExternalLink size={14} />}
            >
                Connect GitHub
            </Button>
            <Text size="xs" color="dimmed">
                Opens in a new tab. This page will automatically continue once
                the installation is complete.
            </Text>
        </Stack>
    );
};
