import {
    Alert,
    Button,
    Group,
    Image,
    Loader,
    Select,
    Stack,
    Text,
} from '@mantine/core';
import { IconAlertCircle, IconCheck } from '@tabler/icons-react';
import { type FC, useMemo, useState } from 'react';
import { useGoogleLoginPopup } from '../../hooks/gdrive/useGdrive';
import {
    useBigqueryProjects,
    useIsBigQueryAuthenticated,
} from '../../hooks/useBigquerySSO';
import MantineIcon from '../common/MantineIcon';

// Google logo as base64 SVG (same as used in BigQueryForm)
const GOOGLE_LOGO_BASE64 =
    'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGcgZmlsbD0ibm9uZSIgZmlsbC1ydWxlPSJldmVub2RkIj48cGF0aCBkPSJNMTcuNiA5LjJsLS4xLTEuOEg5djMuNGg0LjhDMTMuNiAxMiAxMyAxMyAxMiAxMy42djIuMmgzYTguOCA4LjggMCAwIDAgMi42LTYuNnoiIGZpbGw9IiM0Mjg1RjQiIGZpbGwtcnVsZT0ibm9uemVybyIvPjxwYXRoIGQ9Ik05IDE4YzIuNCAwIDQuNS0uOCA2LTIuMmwtMy0yLjJhNS40IDUuNCAwIDAgMS04LTIuOUgxVjEzYTkgOSAwIDAgMCA4IDV6IiBmaWxsPSIjMzRBODUzIiBmaWxsLXJ1bGU9Im5vbnplcm8iLz48cGF0aCBkPSJNNCAxMC43YTUuNCA1LjQgMCAwIDEgMC0zLjRWNUgxYTkgOSAwIDAgMCAwIDhsMy0yLjN6IiBmaWxsPSIjRkJCQzA1IiBmaWxsLXJ1bGU9Im5vbnplcm8iLz48cGF0aCBkPSJNOSAzLjZjMS4zIDAgMi41LjQgMy40IDEuM0wxNSAyLjNBOSA5IDAgMCAwIDEgNWwzIDIuNGE1LjQgNS40IDAgMCAxIDUtMy43eiIgZmlsbD0iI0VBNDMzNSIgZmlsbC1ydWxlPSJub256ZXJvIi8+PHBhdGggZD0iTTAgMGgxOHYxOEgweiIvPjwvZz48L3N2Zz4=';

type Props = {
    onComplete: (gcpProjectId: string) => void;
};

export const OnboardingBigQueryStep: FC<Props> = ({ onComplete }) => {
    const [gcpProjectId, setGcpProjectId] = useState<string | null>(null);

    const {
        data,
        isLoading: isCheckingAuth,
        error: bigqueryAuthError,
        refetch,
    } = useIsBigQueryAuthenticated();
    const isAuthenticated = data !== undefined && bigqueryAuthError === null;

    // Fetch available GCP projects when authenticated
    const { data: projects, isLoading: isLoadingProjects } =
        useBigqueryProjects(isAuthenticated);

    const projectOptions = useMemo(
        () =>
            projects?.map((p) => ({
                value: p.projectId,
                label: p.friendlyName
                    ? `${p.friendlyName} (${p.projectId})`
                    : p.projectId,
            })) ?? [],
        [projects],
    );

    // Use existing hook that handles popup OAuth flow
    const {
        mutate: openLoginPopup,
        isLoading: isLoggingIn,
        isError,
        error,
    } = useGoogleLoginPopup('bigquery', async () => {
        // After successful OAuth, refetch auth status
        await refetch();
    });

    if (isCheckingAuth) {
        return <Loader size="sm" />;
    }

    // Already connected - show GCP project selector
    if (isAuthenticated) {
        return (
            <Stack spacing="md">
                <Group>
                    <MantineIcon icon={IconCheck} color="green" size="lg" />
                    <div>
                        <Text fw={500}>BigQuery Connected</Text>
                        <Text size="sm" color="dimmed">
                            Your Google account is connected with BigQuery
                            access
                        </Text>
                    </div>
                </Group>
                <Select
                    label="GCP Project"
                    placeholder="Select a project..."
                    description="Select the Google Cloud project where your BigQuery data lives"
                    data={projectOptions}
                    value={gcpProjectId}
                    onChange={setGcpProjectId}
                    searchable
                    nothingFound={
                        isLoadingProjects
                            ? 'Loading projects...'
                            : 'No projects found'
                    }
                    rightSection={
                        isLoadingProjects ? <Loader size="xs" /> : null
                    }
                    required
                />
                <Button
                    onClick={() => gcpProjectId && onComplete(gcpProjectId)}
                    disabled={!gcpProjectId}
                >
                    Continue
                </Button>
            </Stack>
        );
    }

    // Show error if OAuth failed
    if (isError) {
        return (
            <Stack spacing="md">
                <Alert
                    icon={<IconAlertCircle size={16} />}
                    color="red"
                    title="Connection failed"
                >
                    <Text size="sm">
                        {error?.message ||
                            'Could not connect to BigQuery. Please try again.'}
                    </Text>
                </Alert>
                <Button
                    leftIcon={<Image width={16} src={GOOGLE_LOGO_BASE64} />}
                    onClick={() => openLoginPopup()}
                    variant="default"
                >
                    Try again
                </Button>
            </Stack>
        );
    }

    // Not connected
    return (
        <Stack spacing="md">
            <Text>
                Connect to BigQuery using your Google account. We'll use OAuth
                to securely access your data warehouse.
            </Text>
            <Button
                leftIcon={<Image width={16} src={GOOGLE_LOGO_BASE64} />}
                onClick={() => openLoginPopup()}
                loading={isLoggingIn}
                variant="default"
            >
                Sign in with Google
            </Button>
        </Stack>
    );
};
