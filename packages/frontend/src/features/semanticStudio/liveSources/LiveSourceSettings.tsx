/**
 * One live data source's settings, below its summary on its own page. Rows
 * of a label on the left and its control on the right: what the source is
 * (name, account, access), then its data (fields and caching), then
 * deleting it. Edits wait for one Save; refreshing and purging act at once.
 */
import {
    LIVE_SOURCE_CACHE_TTL_MAX_SECONDS,
    type UpdateExternalConnection,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    PasswordInput,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { useForm, type UseFormReturnType } from '@mantine/form';
import { IconTrash } from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { ConnectionTestResult } from '../../externalConnections/components/ConnectionTestResult';
import {
    usePurgeLiveSourceCache,
    useUpdateLiveSourceCache,
} from '../../externalConnections/hooks/useLiveSourceCache';
import {
    useLiveSourceFields,
    useRefreshLiveSourceFields,
} from '../../externalConnections/hooks/useLiveSourceFields';
import { useTestConnection } from '../../externalConnections/hooks/useTestConnection';
import { useTestConnectionConfig } from '../../externalConnections/hooks/useTestConnectionConfig';
import {
    LIVE_SOURCE_UPDATE_MESSAGES,
    useUpdateExternalConnection,
} from '../../externalConnections/hooks/useUpdateExternalConnection';
import { getLiveSource } from '../../externalConnections/liveSources/liveSourceCatalog';
import { ProjectCacheOffAlert } from '../../externalConnections/liveSources/ProjectCacheOffAlert';
import {
    normalizeAccountId,
    toTokenLiveSourceCreatePayload,
    toTokenLiveSourceUpdatePayload,
    type TokenLiveSourceForm,
} from '../../externalConnections/liveSources/tokenLiveSource';
import {
    formatFreshness,
    getLiveSourceFreshness,
    type LiveSourceConnection,
} from './liveSourceRows';
import classes from './LiveSources.module.css';

const WINDOW_SECONDS = [
    0,
    60,
    5 * 60,
    15 * 60,
    30 * 60,
    60 * 60,
    6 * 60 * 60,
    LIVE_SOURCE_CACHE_TTL_MAX_SECONDS,
];

/** A label and a short hint on the left, its control on the right. */
const SettingsRow: FC<{
    label: string;
    hint?: ReactNode;
    children: ReactNode;
}> = ({ label, hint, children }) => (
    <Box className={classes.settingsRow}>
        <Box miw={0}>
            <span className={classes.settingsLabel}>{label}</span>
            {hint ? <Box className={classes.settingsHint}>{hint}</Box> : null}
        </Box>
        <Group gap="xs" wrap="nowrap" justify="flex-end" flex="none">
            {children}
        </Group>
    </Box>
);

/** The same raised card as the summary above, one row per setting. */
const SettingsCard: FC<{ title?: string; children: ReactNode }> = ({
    title,
    children,
}) => (
    <Stack gap={6}>
        {title ? <span className={classes.settingsTitle}>{title}</span> : null}
        <Box className={classes.settings}>{children}</Box>
    </Stack>
);

const formatDate = (date: Date | string) =>
    new Date(date).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    });

const formatPurgedAt = (purgedAt: Date | null | undefined) =>
    purgedAt ? `Last purged ${formatDate(purgedAt)}` : 'Never purged';

type Values = {
    name: string;
    accountId: string;
    /** Blank keeps the saved token. */
    token: string;
    /** Seconds, as the select holds it. */
    ttl: string;
};

const toValues = (
    connection: LiveSourceConnection,
    tokenForm: TokenLiveSourceForm | null,
): Values => ({
    name: connection.name,
    accountId: tokenForm ? tokenForm.getAccountId(connection) : '',
    token: '',
    ttl: String(getLiveSourceFreshness(connection).seconds),
});

/** The saved token, or a new one in its place, and a check that it works. */
const TokenRow: FC<{
    projectUuid: string;
    connection: LiveSourceConnection;
    tokenForm: TokenLiveSourceForm;
    form: UseFormReturnType<Values>;
    isReplacing: boolean;
    onReplace: () => void;
    onKeep: () => void;
}> = ({
    projectUuid,
    connection,
    tokenForm,
    form,
    isReplacing,
    onReplace,
    onKeep,
}) => {
    const testSaved = useTestConnection();
    const testNew = useTestConnectionConfig();
    const { values } = form;
    const usesSavedToken = values.token.trim() === '';
    const test = usesSavedToken ? testSaved : testNew;
    const handleTest = () => {
        const request = tokenForm.getTestRequest(
            normalizeAccountId(tokenForm, values.accountId),
        );
        if (usesSavedToken) {
            testSaved.mutate({
                projectUuid,
                connectionUuid: connection.externalConnectionUuid,
                config: toTokenLiveSourceUpdatePayload(tokenForm, values),
                ...request,
            });
            return;
        }
        testNew.mutate({
            projectUuid,
            config: toTokenLiveSourceCreatePayload(tokenForm, values),
            ...request,
        });
    };
    return (
        <>
            <SettingsRow
                label={tokenForm.tokenLabel}
                hint={
                    isReplacing
                        ? 'The new token replaces the saved one when you save'
                        : 'Saved and encrypted, never shown again'
                }
            >
                {isReplacing ? (
                    <>
                        <PasswordInput
                            w={240}
                            size="xs"
                            placeholder="New token"
                            aria-label={`New ${tokenForm.tokenLabel}`}
                            data-autofocus
                            {...form.getInputProps('token')}
                        />
                        <Button
                            size="xs"
                            variant="subtle"
                            color="gray"
                            onClick={onKeep}
                        >
                            Cancel
                        </Button>
                    </>
                ) : (
                    <Button size="xs" variant="default" onClick={onReplace}>
                        Replace
                    </Button>
                )}
                <Button
                    size="xs"
                    variant="default"
                    loading={test.isLoading}
                    onClick={handleTest}
                >
                    Test
                </Button>
            </SettingsRow>
            {test.data ? (
                <Box px="md" pb="sm">
                    <ConnectionTestResult response={test.data} />
                </Box>
            ) : null}
        </>
    );
};

export const LiveSourceSettings: FC<{
    projectUuid: string;
    connection: LiveSourceConnection;
    /** Null when this instance has no sign-in for the integration. */
    reconnect: (() => void) | null;
    /** Opens the integration's own form, for sources signed in with it. */
    onEdit: () => void;
    onDelete: () => void;
}> = ({ projectUuid, connection, reconnect, onEdit, onDelete }) => {
    const params = {
        projectUuid,
        connectionUuid: connection.externalConnectionUuid,
    };
    const { setup } = getLiveSource(connection.apiSource.connector);
    const tokenForm = setup.kind === 'token' ? setup.form : null;
    const { data: fields } = useLiveSourceFields(params);
    const refreshFields = useRefreshLiveSourceFields(params);
    const purge = usePurgeLiveSourceCache(params);
    const updateCache = useUpdateLiveSourceCache(params);
    const updateSource = useUpdateExternalConnection(
        LIVE_SOURCE_UPDATE_MESSAGES,
    );
    const [isPurgeOpen, setIsPurgeOpen] = useState(false);
    const [isReplacingToken, setIsReplacingToken] = useState(false);

    const form = useForm<Values>({
        initialValues: toValues(connection, tokenForm),
        validate: {
            name: (value) =>
                value.trim().length === 0 ? 'Name is required' : null,
            accountId: (value) =>
                !tokenForm?.account ||
                tokenForm.account.isValid(tokenForm.account.normalize(value))
                    ? null
                    : tokenForm.account.invalidMessage,
        },
    });
    const isSaving = updateSource.isLoading || updateCache.isLoading;

    // A window set through the API may not be one of the presets.
    const savedTtl = Number(form.getInitialValues().ttl);
    const ttlOptions = WINDOW_SECONDS.includes(savedTtl)
        ? WINDOW_SECONDS
        : [...WINDOW_SECONDS, savedTtl].sort((a, b) => a - b);

    // Every explore whose fields can be curated, not only the first
    const allFields = fields?.explores.flatMap((explore) => explore.fields);
    const fieldsHint = allFields
        ? `${allFields.filter((field) => field.inUse).length} of ${allFields.length} in use`
        : null;

    const keepToken = () => {
        form.setFieldValue('token', '');
        setIsReplacingToken(false);
    };

    const handleSave = form.onSubmit(async (values) => {
        const initial = form.getInitialValues();
        const sourceChanged =
            values.name !== initial.name ||
            values.accountId !== initial.accountId ||
            values.token.trim() !== '';
        const sourceUpdate: UpdateExternalConnection = tokenForm
            ? toTokenLiveSourceUpdatePayload(tokenForm, values)
            : { name: values.name.trim() };
        await Promise.all([
            sourceChanged
                ? updateSource.mutateAsync({
                      ...params,
                      data: sourceUpdate,
                  })
                : null,
            values.ttl !== initial.ttl
                ? updateCache.mutateAsync({ ttlSeconds: Number(values.ttl) })
                : null,
        ]);
        const saved = { ...values, name: values.name.trim(), token: '' };
        form.setInitialValues(saved);
        form.setValues(saved);
        setIsReplacingToken(false);
    });

    return (
        <form onSubmit={handleSave}>
            <Stack gap="lg">
                <SettingsCard title="Source">
                    <SettingsRow
                        label="Name"
                        hint="Shown in explores and to agents"
                    >
                        <TextInput
                            w={240}
                            size="xs"
                            aria-label="Name"
                            {...form.getInputProps('name')}
                        />
                    </SettingsRow>
                    {tokenForm?.account ? (
                        <SettingsRow
                            label={tokenForm.account.label}
                            hint={tokenForm.account.description}
                        >
                            <TextInput
                                w={240}
                                size="xs"
                                aria-label={tokenForm.account.label}
                                placeholder={tokenForm.account.placeholder}
                                {...form.getInputProps('accountId')}
                            />
                        </SettingsRow>
                    ) : null}
                    {tokenForm ? (
                        <TokenRow
                            projectUuid={projectUuid}
                            connection={connection}
                            tokenForm={tokenForm}
                            form={form}
                            isReplacing={isReplacingToken}
                            onReplace={() => setIsReplacingToken(true)}
                            onKeep={keepToken}
                        />
                    ) : (
                        <SettingsRow
                            label="Account"
                            hint="Signed in to the integration"
                        >
                            <Button
                                size="xs"
                                variant="default"
                                onClick={onEdit}
                            >
                                Edit
                            </Button>
                            {reconnect ? (
                                <Button
                                    size="xs"
                                    variant="default"
                                    onClick={reconnect}
                                >
                                    Sign in again
                                </Button>
                            ) : null}
                        </SettingsRow>
                    )}
                </SettingsCard>

                <SettingsCard title="Data">
                    <SettingsRow label="Fields" hint={fieldsHint}>
                        <Button
                            size="xs"
                            variant="default"
                            loading={refreshFields.isLoading}
                            onClick={() => refreshFields.mutate()}
                        >
                            Refresh
                        </Button>
                    </SettingsRow>
                    <SettingsRow
                        label="Reuse results for"
                        hint={
                            <>
                                Everyone gets the same result until it expires
                                <ProjectCacheOffAlert
                                    projectUuid={projectUuid}
                                />
                            </>
                        }
                    >
                        <Select
                            w={116}
                            size="xs"
                            aria-label="Reuse results for"
                            allowDeselect={false}
                            comboboxProps={{ withinPortal: true }}
                            data={ttlOptions.map((option) => ({
                                value: String(option),
                                label: formatFreshness(option),
                            }))}
                            {...form.getInputProps('ttl')}
                        />
                    </SettingsRow>
                    <SettingsRow
                        label="Cached results"
                        hint={formatPurgedAt(connection.cachePurgedAt)}
                    >
                        <Button
                            size="xs"
                            variant="default"
                            loading={purge.isLoading}
                            onClick={() => setIsPurgeOpen(true)}
                        >
                            Purge
                        </Button>
                    </SettingsRow>
                </SettingsCard>

                <SettingsCard title="Danger zone">
                    <SettingsRow
                        label="Delete live data source"
                        hint="Removes its explores; charts on it stop working"
                    >
                        <Button
                            size="xs"
                            variant="default"
                            c="red"
                            leftSection={<MantineIcon icon={IconTrash} />}
                            onClick={onDelete}
                        >
                            Delete
                        </Button>
                    </SettingsRow>
                </SettingsCard>

                {form.isDirty() ? (
                    <Group justify="flex-end" gap="sm">
                        <Text fz={13} c="dimmed">
                            Unsaved changes
                        </Text>
                        <Button
                            variant="subtle"
                            color="gray"
                            disabled={isSaving}
                            onClick={() => {
                                form.reset();
                                setIsReplacingToken(false);
                            }}
                        >
                            Discard
                        </Button>
                        <Button type="submit" loading={isSaving}>
                            Save changes
                        </Button>
                    </Group>
                ) : null}
            </Stack>

            <MantineModal
                opened={isPurgeOpen}
                onClose={() => setIsPurgeOpen(false)}
                title="Purge cached results?"
                role="alertdialog"
                description={`Results from "${connection.name}" stop being reused. The next query from anyone calls the integration for fresh data.`}
                confirmLabel="Purge"
                confirmLoading={purge.isLoading}
                onConfirm={() =>
                    purge.mutate(undefined, {
                        onSettled: () => setIsPurgeOpen(false),
                    })
                }
            />
        </form>
    );
};
