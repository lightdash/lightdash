/**
 * How a live data source signs in: its account, region and key, or the
 * account it signed in with, and a test that it still works. The page tests
 * what is saved; the dialog tests what is typed, before anything is saved.
 */
import {
    Button,
    Code,
    PasswordInput,
    SegmentedControl,
    TextInput,
} from '@mantine/core';
import { IconKey } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTestConnection } from '../hooks/useTestConnection';
import { getLiveSourceTestRequest } from './liveSourceAccess';
import { getApiSourceTarget } from './liveSourceCatalog';
import { type LiveSourceConnection } from './liveSourceRows';
import {
    EditableSettingsCard,
    SettingsRow,
    SettingsValue,
} from './LiveSourceSettingsRows';
import { LiveSourceTestRow } from './LiveSourceTestRow';
import { SETTINGS_FIELD_WIDTH } from './settingsLayout';
import { type LiveSourceForm } from './useLiveSourceForm';

const POSTHOG_REGIONS = [
    { value: 'us', label: 'US Cloud' },
    { value: 'eu', label: 'EU Cloud' },
];

export const LiveSourceAuthCard: FC<{
    projectUuid: string;
    connection: LiveSourceConnection;
    source: LiveSourceForm;
    /** Null when this instance has no sign-in for the integration. */
    reconnect: (() => void) | null;
}> = ({ projectUuid, connection, source, reconnect }) => {
    const { form, access, accountField, tokenLabel, isPostHogKey, auth } =
        source;
    const params = {
        projectUuid,
        connectionUuid: connection.externalConnectionUuid,
    };
    const [isEditing, setIsEditing] = useState(false);
    // Separate, so a result on the page doesn't show in the dialog
    const savedTest = useTestConnection({ showErrorToast: false });
    const draftTest = useTestConnection({ showErrorToast: false });
    const savedTestRequest = getLiveSourceTestRequest(connection, access, {
        ...form.values,
        ...form.getInitialValues(),
    });
    const draftTestRequest = getLiveSourceTestRequest(
        connection,
        access,
        form.values,
    );

    const testSaved = () => {
        if (savedTestRequest)
            savedTest.mutate({ ...params, ...savedTestRequest });
    };

    const testDraft = () => {
        if (!draftTestRequest) return;
        if (!auth.isChanged) {
            draftTest.mutate({ ...params, ...draftTestRequest });
            return;
        }
        if (!auth.validate()) return;
        draftTest.mutate({
            ...params,
            ...draftTestRequest,
            config: auth.toUpdate(),
        });
    };

    return (
        <EditableSettingsCard
            title="Authentication"
            icon={IconKey}
            canEdit={auth.hasFields || reconnect !== null}
            isEditing={isEditing}
            onEdit={() => setIsEditing(true)}
            onCancel={() => {
                auth.revert();
                setIsEditing(false);
            }}
            onSave={
                auth.hasFields
                    ? () =>
                          void auth.save().then((isSaved) => {
                              if (isSaved) setIsEditing(false);
                          })
                    : undefined
            }
            isChanged={auth.isChanged}
            isSaving={source.isSaving}
        >
            {(editing) => (
                <>
                    {accountField ? (
                        <SettingsRow
                            label={accountField.label}
                            hint={accountField.description}
                        >
                            {editing ? (
                                <TextInput
                                    w={SETTINGS_FIELD_WIDTH}
                                    size="xs"
                                    aria-label={accountField.label}
                                    placeholder={accountField.placeholder}
                                    autoComplete="off"
                                    {...form.getInputProps('accountId')}
                                />
                            ) : form.values.accountId ? (
                                <Code fz="xs">{form.values.accountId}</Code>
                            ) : (
                                <SettingsValue isEmpty>Not set</SettingsValue>
                            )}
                        </SettingsRow>
                    ) : null}
                    {isPostHogKey ? (
                        <SettingsRow label="Region" hint="Where you log in">
                            {editing ? (
                                <SegmentedControl
                                    size="xs"
                                    w={SETTINGS_FIELD_WIDTH}
                                    data={POSTHOG_REGIONS}
                                    {...form.getInputProps('region')}
                                />
                            ) : (
                                <SettingsValue>
                                    {
                                        POSTHOG_REGIONS.find(
                                            ({ value }) =>
                                                value === form.values.region,
                                        )?.label
                                    }
                                </SettingsValue>
                            )}
                        </SettingsRow>
                    ) : null}
                    {tokenLabel ? (
                        <SettingsRow
                            label={tokenLabel}
                            hint="Encrypted, never shown again"
                        >
                            {editing ? (
                                <PasswordInput
                                    size="xs"
                                    w={SETTINGS_FIELD_WIDTH}
                                    aria-label={`New ${tokenLabel}`}
                                    placeholder="Leave empty to keep the saved key"
                                    autoComplete="off"
                                    {...form.getInputProps('token')}
                                />
                            ) : (
                                // A note that a key exists, not the key: dimmed like "Never"
                                <SettingsValue isEmpty>Saved</SettingsValue>
                            )}
                        </SettingsRow>
                    ) : (
                        <SettingsRow
                            label="Account"
                            hint={`Reads ${getApiSourceTarget(connection.apiSource)}`}
                        >
                            {reconnect && editing ? (
                                <Button
                                    size="xs"
                                    variant="default"
                                    onClick={reconnect}
                                >
                                    Sign in again
                                </Button>
                            ) : connection.targetLabel ? (
                                <SettingsValue>
                                    {connection.targetLabel}
                                </SettingsValue>
                            ) : null}
                        </SettingsRow>
                    )}
                    {isPostHogKey && reconnect && editing ? (
                        <SettingsRow
                            label="Sign in instead"
                            hint="Replaces the key with a PostHog sign-in"
                        >
                            <Button
                                size="xs"
                                variant="default"
                                onClick={reconnect}
                            >
                                Sign in with PostHog
                            </Button>
                        </SettingsRow>
                    ) : null}
                    {editing ? (
                        draftTestRequest ? (
                            <LiveSourceTestRow
                                hint="Checks the details above, without saving"
                                test={draftTest}
                                onTest={testDraft}
                                inputs={auth.typed}
                            />
                        ) : null
                    ) : savedTestRequest ? (
                        <LiveSourceTestRow
                            hint="Runs a quick check"
                            test={savedTest}
                            onTest={testSaved}
                            inputs={auth.saved}
                        />
                    ) : (
                        <SettingsRow
                            label="Status"
                            hint="No test for this integration yet"
                        >
                            <Button size="xs" variant="default" disabled>
                                Test
                            </Button>
                        </SettingsRow>
                    )}
                </>
            )}
        </EditableSettingsCard>
    );
};
