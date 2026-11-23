/**
 * Adds a PostHog source, laid out like its settings: how it reaches PostHog
 * first, by signing in or with a personal API key, then what it is called.
 */
import { ApiConnectorType, POSTHOG_TEST_QUERY } from '@lightdash/common';
import {
    Button,
    PasswordInput,
    SegmentedControl,
    Stack,
    TextInput,
} from '@mantine/core';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import {
    LIVE_SOURCE_CREATE_MESSAGES,
    useCreateExternalConnection,
} from '../hooks/useCreateExternalConnection';
import { useNewSourceId } from '../hooks/useNewSourceId';
import { useTestConnectionConfig } from '../hooks/useTestConnectionConfig';
import { LiveSourceTitle } from './LiveSourceIcon';
import {
    SettingsCard,
    SettingsRow,
    TestOutcome,
} from './LiveSourceSettingsRows';
import { LiveSourceSetupCard } from './LiveSourceSetupCard';
import { NewLiveSourceDetails } from './NewLiveSourceDetails';
import {
    getPostHogQueryPath,
    getPostHogSignInUrl,
    POSTHOG_PROJECT_ID_FIELD,
    toPostHogCreatePayload,
    usePostHogConnectionForm,
    type PostHogAuthMethod,
    type PostHogRegion,
} from './postHogConnection';

/** Matches the fields of the Details card below. */
const FIELD_WIDTH = 240;

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    canSignIn: boolean;
    onCreated: (connectionUuid: string) => void;
};

export const PostHogConnectionModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    canSignIn,
    onCreated,
}) => {
    const form = usePostHogConnectionForm(null, canSignIn);
    const createMutation = useCreateExternalConnection(
        LIVE_SOURCE_CREATE_MESSAGES,
    );
    const testMutation = useTestConnectionConfig();
    const sourceId = useNewSourceId({
        projectUuid,
        connector: ApiConnectorType.POSTHOG,
        name: form.values.name,
        enabled: opened,
    });
    const isSaving = createMutation.isLoading;
    const isSignIn = form.values.authMethod === 'signIn';

    const handleTest = () => {
        if (form.validate().hasErrors) return;
        testMutation.mutate({
            projectUuid,
            config: toPostHogCreatePayload(form.values),
            method: 'POST',
            path: getPostHogQueryPath(form.values.projectId.trim()),
            body: { query: { kind: 'HogQLQuery', query: POSTHOG_TEST_QUERY } },
        });
    };

    const handleSave = form.onSubmit(async (values) => {
        if (sourceId.isBlocked) return;
        if (values.authMethod === 'signIn') {
            window.location.assign(
                getPostHogSignInUrl(
                    projectUuid,
                    values,
                    null,
                    'settings',
                    sourceId.value,
                ),
            );
            return;
        }
        const created = await createMutation.mutateAsync({
            projectUuid,
            data: toPostHogCreatePayload(values, sourceId.value),
        });
        onCreated(created.externalConnectionUuid);
    });

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            size="xl"
            title={
                <LiveSourceTitle connector={ApiConnectorType.POSTHOG}>
                    Add PostHog source
                </LiveSourceTitle>
            }
            confirmLabel={isSignIn ? 'Continue to PostHog' : 'Add source'}
            onConfirm={() => handleSave()}
            confirmLoading={isSaving}
            confirmDisabled={sourceId.isBlocked}
            cancelDisabled={isSaving}
        >
            <Stack gap="lg">
                {isSignIn ? null : (
                    <LiveSourceSetupCard connector={ApiConnectorType.POSTHOG} />
                )}
                <SettingsCard title="Access">
                    {canSignIn ? (
                        <SettingsRow
                            label="Connect with"
                            hint="Sign in or use a key"
                        >
                            <SegmentedControl
                                size="xs"
                                w={FIELD_WIDTH}
                                data={[
                                    { value: 'signIn', label: 'Sign in' },
                                    { value: 'apiKey', label: 'API key' },
                                ]}
                                value={form.values.authMethod}
                                onChange={(value) =>
                                    form.setFieldValue(
                                        'authMethod',
                                        value as PostHogAuthMethod,
                                    )
                                }
                            />
                        </SettingsRow>
                    ) : null}
                    <SettingsRow label="Region" hint="Where you log in">
                        <SegmentedControl
                            size="xs"
                            w={FIELD_WIDTH}
                            data={[
                                { value: 'us', label: 'US Cloud' },
                                { value: 'eu', label: 'EU Cloud' },
                            ]}
                            value={form.values.region}
                            onChange={(value) =>
                                form.setFieldValue(
                                    'region',
                                    value as PostHogRegion,
                                )
                            }
                        />
                    </SettingsRow>
                    {isSignIn ? null : (
                        <>
                            <SettingsRow
                                label={POSTHOG_PROJECT_ID_FIELD.label}
                                hint={POSTHOG_PROJECT_ID_FIELD.description}
                            >
                                <TextInput
                                    w={FIELD_WIDTH}
                                    size="xs"
                                    aria-label={POSTHOG_PROJECT_ID_FIELD.label}
                                    placeholder={
                                        POSTHOG_PROJECT_ID_FIELD.placeholder
                                    }
                                    {...form.getInputProps('projectId')}
                                />
                            </SettingsRow>
                            <SettingsRow
                                label="Personal API key"
                                hint={
                                    testMutation.data ? (
                                        <TestOutcome
                                            response={testMutation.data}
                                        />
                                    ) : (
                                        'Read access is enough'
                                    )
                                }
                            >
                                <PasswordInput
                                    w={FIELD_WIDTH}
                                    size="xs"
                                    aria-label="Personal API key"
                                    placeholder="phx_..."
                                    {...form.getInputProps('apiKey')}
                                />
                                <Button
                                    size="xs"
                                    variant="default"
                                    onClick={handleTest}
                                    loading={testMutation.isLoading}
                                >
                                    Test
                                </Button>
                            </SettingsRow>
                        </>
                    )}
                </SettingsCard>

                <NewLiveSourceDetails
                    nameProps={form.getInputProps('name')}
                    sourceId={sourceId}
                />
            </Stack>
        </MantineModal>
    );
};
