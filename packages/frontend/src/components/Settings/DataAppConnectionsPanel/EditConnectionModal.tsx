import {
    type ApiSaveExternalConnectionSampleRequest,
    type ExternalConnection,
    type UpdateExternalConnection,
} from '@lightdash/common';
import { Button, Stack, Tabs, Text, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPencil } from '@tabler/icons-react';
import { type FC, useState } from 'react';
import {
    isValidGoogleOAuthScope,
    isValidOAuthScope,
} from '../../../features/externalConnections/constants';
import { useSaveConnectionSample } from '../../../features/externalConnections/hooks/useSaveConnectionSample';
import { useUpdateExternalConnection } from '../../../features/externalConnections/hooks/useUpdateExternalConnection';
import {
    customHeaderRowsToRecord,
    recordToCustomHeaderRows,
    validateCustomHeaderRows,
} from '../../../features/externalConnections/utils/customHeaders';
import {
    derivePathRules,
    resolvePathPrefixes,
} from '../../../features/externalConnections/utils/pathRules';
import MantineModal, {
    type MantineModalProps,
} from '../../common/MantineModal';
import { ConnectionExamplesPanel } from './ConnectionExamplesPanel';
import {
    ExternalConnectionForm,
    type ExternalConnectionFormValues,
} from './ExternalConnectionForm';

const FORM_ID = 'edit-external-connection-form';

const toUpdateExternalConnection = (
    values: ExternalConnectionFormValues,
): UpdateExternalConnection => ({
    name: values.name,
    origin: values.origin,
    instructions: values.instructions.trim() || null,
    type: values.type,
    allowBrowserImages: values.allowBrowserImages,
    allowDataAppBuilderLinking: values.allowDataAppBuilderLinking,
    allowedMethods: values.allowedMethods,
    allowedPathPrefixes: resolvePathPrefixes(
        values.pathMode,
        values.allowedPathPrefixes,
    ),
    allowedContentTypes: values.allowedContentTypes,
    responseMaxBytes: values.responseMaxBytes,
    requestMaxBytes: values.requestMaxBytes,
    timeoutMs: values.timeoutMs,
    rateLimitPerMinute: values.rateLimitPerMinute,
    apiKeyName: values.type === 'api_key' ? values.apiKeyName : null,
    apiKeyLocation: values.type === 'api_key' ? values.apiKeyLocation : null,
    oauthScopes:
        values.type === 'google_service_account' ||
        values.type === 'oauth_client_credentials'
            ? values.oauthScopes
            : null,
    oauthTokenUrl:
        values.type === 'oauth_client_credentials'
            ? values.oauthTokenUrl.trim()
            : null,
    oauthClientId:
        values.type === 'oauth_client_credentials'
            ? values.oauthClientId.trim()
            : null,
    oauthClientAuthMethod:
        values.type === 'oauth_client_credentials'
            ? values.oauthClientAuthMethod
            : null,
    customHeaders: customHeaderRowsToRecord(values.customHeaders),
    // Blank => omit so the stored secret is unchanged. A non-blank value on a
    // non-"none" type is used for both testing and credential rotation.
    ...(values.type !== 'none' && values.secret
        ? { secret: values.secret }
        : {}),
});

type PendingSample = ApiSaveExternalConnectionSampleRequest & {
    configFingerprint: string;
};

type Props = Pick<MantineModalProps, 'opened' | 'onClose'> & {
    projectUuid: string;
    connection: ExternalConnection;
};

const EditConnectionModalContent: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    connection,
}) => {
    const { mutateAsync, isLoading: isUpdating } =
        useUpdateExternalConnection();
    const { mutateAsync: saveSample, isLoading: isSavingSample } =
        useSaveConnectionSample();
    const [pendingSample, setPendingSample] = useState<PendingSample | null>(
        null,
    );
    const pathRules = derivePathRules(connection.allowedPathPrefixes);
    const form = useForm<ExternalConnectionFormValues>({
        initialValues: {
            name: connection.name,
            origin: connection.origin,
            instructions: connection.instructions ?? '',
            type: connection.type,
            allowBrowserImages: connection.allowBrowserImages ?? false,
            allowDataAppBuilderLinking:
                connection.allowDataAppBuilderLinking ?? false,
            secret: '',
            apiKeyName: connection.apiKeyName ?? '',
            apiKeyLocation: connection.apiKeyLocation ?? 'header',
            oauthScopes: connection.oauthScopes ?? [],
            oauthTokenUrl: connection.oauthTokenUrl ?? '',
            oauthClientId: connection.oauthClientId ?? '',
            oauthClientAuthMethod: connection.oauthClientAuthMethod ?? 'basic',
            customHeaders: recordToCustomHeaderRows(connection.customHeaders),
            allowedMethods: connection.allowedMethods,
            pathMode: pathRules.mode,
            allowedPathPrefixes: pathRules.prefixes,
            allowedContentTypes: connection.allowedContentTypes,
            responseMaxBytes: connection.responseMaxBytes,
            requestMaxBytes: connection.requestMaxBytes,
            timeoutMs: connection.timeoutMs,
            rateLimitPerMinute: connection.rateLimitPerMinute,
        },
        validate: {
            name: (value) =>
                value.trim().length === 0 ? 'Name is required' : null,
            origin: (value) =>
                value.startsWith('https://')
                    ? null
                    : 'Origin must start with https://',
            secret: (value, values) => {
                // Blank keeps the stored secret; only validate a new one.
                if (values.type === 'google_service_account' && value) {
                    try {
                        JSON.parse(value);
                    } catch {
                        return 'Paste valid service account JSON';
                    }
                }
                if (values.type === 'oauth_client_credentials' && !value) {
                    if (
                        connection.type !== 'oauth_client_credentials' ||
                        !connection.hasSecret
                    ) {
                        return 'Client secret is required';
                    }
                    if (
                        values.oauthTokenUrl.trim() !==
                            (connection.oauthTokenUrl ?? '') ||
                        values.oauthClientId.trim() !==
                            (connection.oauthClientId ?? '')
                    ) {
                        return 'Re-enter the client secret when changing the token URL or client ID';
                    }
                }
                return null;
            },
            oauthScopes: (value, values) => {
                if (
                    values.type !== 'google_service_account' &&
                    values.type !== 'oauth_client_credentials'
                )
                    return null;
                if (
                    values.type === 'google_service_account' &&
                    value.length === 0
                )
                    return 'Add at least one OAuth scope';
                const isValid =
                    values.type === 'google_service_account'
                        ? isValidGoogleOAuthScope
                        : isValidOAuthScope;
                const invalid = value.find((s) => !isValid(s));
                return invalid ? `Invalid OAuth scope: ${invalid}` : null;
            },
            oauthTokenUrl: (value, values) => {
                if (values.type !== 'oauth_client_credentials') return null;
                try {
                    const url = new URL(value);
                    if (
                        url.protocol !== 'https:' ||
                        url.username ||
                        url.password ||
                        url.hash
                    ) {
                        return 'Enter a valid HTTPS token URL';
                    }
                } catch {
                    return 'Enter a valid HTTPS token URL';
                }
                return null;
            },
            oauthClientId: (value, values) =>
                values.type === 'oauth_client_credentials' &&
                value.trim().length === 0
                    ? 'Client ID is required'
                    : null,
            customHeaders: validateCustomHeaderRows,
            allowedMethods: (value, values) =>
                value.length === 0 && !values.allowBrowserImages
                    ? 'Select at least one method or allow public images'
                    : null,
            allowBrowserImages: (value, values) => {
                if (value && values.type !== 'none') {
                    return 'Public browser images require no authentication';
                }
                return null;
            },
            allowedPathPrefixes: (value, values) => {
                if (values.pathMode !== 'restricted') return null;
                const nonEmpty = value
                    .map((p) => p.value.trim())
                    .filter(Boolean);
                return nonEmpty.length === 0
                    ? 'Add at least one path, or allow all paths'
                    : null;
            },
        },
    });

    const draftConfig = toUpdateExternalConnection(form.values);
    const draftConfigFingerprint = JSON.stringify(draftConfig);
    const validPendingSample =
        pendingSample?.configFingerprint === draftConfigFingerprint
            ? pendingSample
            : null;
    const isSaving = isUpdating || isSavingSample;

    const handleSubmit = async (values: ExternalConnectionFormValues) => {
        const data = toUpdateExternalConnection(values);
        const submittedConfigFingerprint = JSON.stringify(data);
        await mutateAsync({
            projectUuid,
            connectionUuid: connection.externalConnectionUuid,
            data,
        });
        if (
            validPendingSample &&
            validPendingSample.configFingerprint === submittedConfigFingerprint
        ) {
            const { configFingerprint: _configFingerprint, ...sample } =
                validPendingSample;
            await saveSample({
                projectUuid,
                connectionUuid: connection.externalConnectionUuid,
                ...sample,
            });
        }
        onClose();
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={connection.name}
            icon={IconPencil}
            size="xl"
            cancelDisabled={isSaving}
            bodyScrollAreaMaxHeight="calc(90vh - 150px)"
            actions={
                <Button
                    type="submit"
                    form={FORM_ID}
                    disabled={isSaving}
                    loading={isSaving}
                >
                    Save connection
                </Button>
            }
        >
            <form id={FORM_ID} onSubmit={form.onSubmit(handleSubmit)}>
                <Tabs defaultValue="details" keepMounted={false}>
                    <Tabs.List mb="md">
                        <Tabs.Tab value="details">Connection details</Tabs.Tab>
                        <Tabs.Tab value="instructions">Instructions</Tabs.Tab>
                        <Tabs.Tab value="examples">Examples</Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="details">
                        <ExternalConnectionForm
                            form={form}
                            disabled={isSaving}
                            hasSecret={connection.hasSecret}
                        />
                    </Tabs.Panel>

                    <Tabs.Panel value="instructions">
                        <Stack gap="sm">
                            <Text c="dimmed" fz="sm">
                                Notes on how apps should use this API — auth
                                quirks, pagination, which endpoints matter,
                                response caveats. Passed to the app builder when
                                generating apps, alongside the technical spec.
                                Markdown is supported.
                            </Text>
                            <Textarea
                                aria-label="Usage instructions"
                                placeholder="e.g. Paginate with ?page= and ?per_page=. The /issues endpoint returns open issues only unless state=all is passed."
                                autosize
                                minRows={10}
                                maxRows={24}
                                disabled={isSaving}
                                {...form.getInputProps('instructions')}
                            />
                        </Stack>
                    </Tabs.Panel>

                    <Tabs.Panel value="examples" keepMounted>
                        <ConnectionExamplesPanel
                            projectUuid={projectUuid}
                            connection={connection}
                            config={draftConfig}
                            configFingerprint={draftConfigFingerprint}
                            hasUnsavedChanges={form.isDirty()}
                            isSampleQueued={validPendingSample !== null}
                            onQueueSample={(sample) =>
                                setPendingSample({
                                    ...sample,
                                    configFingerprint: draftConfigFingerprint,
                                })
                            }
                            onClearQueuedSample={() => setPendingSample(null)}
                        />
                    </Tabs.Panel>
                </Tabs>
            </form>
        </MantineModal>
    );
};

export const EditConnectionModal: FC<Props> = (props) => (
    // Remount when the user switches connections so useForm re-initialises;
    // refetches of the same connection don't clobber in-progress edits.
    <EditConnectionModalContent
        key={props.connection.externalConnectionUuid}
        {...props}
    />
);
