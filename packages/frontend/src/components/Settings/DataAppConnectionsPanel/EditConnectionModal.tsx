import {
    type ExternalConnection,
    type UpdateExternalConnection,
} from '@lightdash/common';
import { Button, Stack, Tabs, Text, Textarea } from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconPencil } from '@tabler/icons-react';
import { type FC } from 'react';
import { isValidOAuthScope } from '../../../features/externalConnections/constants';
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
    const { mutateAsync, isLoading: isSaving } = useUpdateExternalConnection();
    const pathRules = derivePathRules(connection.allowedPathPrefixes);
    const form = useForm<ExternalConnectionFormValues>({
        initialValues: {
            name: connection.name,
            origin: connection.origin,
            instructions: connection.instructions ?? '',
            type: connection.type,
            secret: '',
            apiKeyName: connection.apiKeyName ?? '',
            apiKeyLocation: connection.apiKeyLocation ?? 'header',
            oauthScopes: connection.oauthScopes ?? [],
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
                return null;
            },
            oauthScopes: (value, values) => {
                if (values.type !== 'google_service_account') return null;
                if (value.length === 0) return 'Add at least one OAuth scope';
                const invalid = value.find((s) => !isValidOAuthScope(s));
                return invalid
                    ? `Invalid OAuth scope: ${invalid} (use an https:// scope)`
                    : null;
            },
            customHeaders: validateCustomHeaderRows,
            allowedMethods: (value) =>
                value.length === 0 ? 'Select at least one method' : null,
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

    const handleSubmit = async (values: ExternalConnectionFormValues) => {
        const data: UpdateExternalConnection = {
            name: values.name,
            origin: values.origin,
            instructions: values.instructions.trim() || null,
            type: values.type,
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
            apiKeyLocation:
                values.type === 'api_key' ? values.apiKeyLocation : null,
            oauthScopes:
                values.type === 'google_service_account'
                    ? values.oauthScopes
                    : null,
            customHeaders: customHeaderRowsToRecord(values.customHeaders),
            // Blank => omit so the stored secret is unchanged. A non-blank
            // value on a non-"none" type rotates it via PATCH.
            ...(values.type !== 'none' && values.secret
                ? { secret: values.secret }
                : {}),
        };
        await mutateAsync({
            projectUuid,
            connectionUuid: connection.externalConnectionUuid,
            data,
        });
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
                            <Text c="ldGray.6" fz="sm">
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

                    <Tabs.Panel value="examples">
                        <ConnectionExamplesPanel
                            projectUuid={projectUuid}
                            connection={connection}
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
