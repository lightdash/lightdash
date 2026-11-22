/**
 * One live data source's settings, below its summary on its own page. Rows
 * of a label on the left and its control on the right: how it signs in
 * (account, access), what it is (name, AI hint), its data (fields and
 * caching), then deleting it. Each setting saves on its own, as soon as it changes.
 */
import {
    LIVE_SOURCE_AI_HINT_MAX_LENGTH,
    LIVE_SOURCE_CACHE_TTL_MAX_SECONDS,
} from '@lightdash/common';
import {
    Box,
    Button,
    Code,
    Group,
    PasswordInput,
    Select,
    Stack,
    Textarea,
    TextInput,
} from '@mantine/core';
import { useForm, type UseFormReturnType } from '@mantine/form';
import { IconTrash } from '@tabler/icons-react';
import { useState, type FC, type KeyboardEvent, type ReactNode } from 'react';
import { CopyActionIcon } from '../../../components/common/CopyActionIcon';
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
import { getApiSourceTarget } from '../../externalConnections/liveSources/liveSourceCatalog';
import { ProjectCacheOffAlert } from '../../externalConnections/liveSources/ProjectCacheOffAlert';
import {
    normalizeAccountId,
    toTokenLiveSourceCreatePayload,
    toTokenLiveSourceUpdatePayload,
    type TokenLiveSourceForm,
} from '../../externalConnections/liveSources/tokenLiveSource';
import {
    getAccountField,
    getLiveSourceAccess,
    getTokenLabel,
    toLiveSourceAccessUpdate,
    toLiveSourceAccessValues,
    type LiveSourceAccessValues,
} from './liveSourceAccess';
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
    purgedAt ? `Last cleared ${formatDate(purgedAt)}` : 'Never cleared';

type Values = LiveSourceAccessValues & {
    /** Seconds, as the select holds it. */
    ttl: string;
};

/** The saved token, or a new one in its place, and a check that it works. */
const TokenRow: FC<{
    projectUuid: string;
    connection: LiveSourceConnection;
    label: string;
    /** Only token integrations know a small read to test with. */
    tokenForm: TokenLiveSourceForm | null;
    form: UseFormReturnType<Values>;
    isReplacing: boolean;
    isSaving: boolean;
    onReplace: () => void;
    onKeep: () => void;
    onSave: () => void;
}> = ({
    projectUuid,
    connection,
    label,
    tokenForm,
    form,
    isReplacing,
    isSaving,
    onReplace,
    onKeep,
    onSave,
}) => {
    const testSaved = useTestConnection();
    const testNew = useTestConnectionConfig();
    const { values } = form;
    const usesSavedToken = values.token.trim() === '';
    const test = usesSavedToken ? testSaved : testNew;
    const handleTest = (definition: TokenLiveSourceForm) => {
        const request = definition.getTestRequest(
            normalizeAccountId(definition, values.accountId),
        );
        if (usesSavedToken) {
            testSaved.mutate({
                projectUuid,
                connectionUuid: connection.externalConnectionUuid,
                config: toTokenLiveSourceUpdatePayload(definition, values),
                ...request,
            });
            return;
        }
        testNew.mutate({
            projectUuid,
            config: toTokenLiveSourceCreatePayload(definition, values),
            ...request,
        });
    };
    return (
        <>
            <SettingsRow
                label={label}
                hint={
                    isReplacing
                        ? 'Replaces the saved one'
                        : 'Saved and encrypted, never shown again'
                }
            >
                {isReplacing ? (
                    <>
                        <PasswordInput
                            w={240}
                            size="xs"
                            placeholder="New token"
                            aria-label={`New ${label}`}
                            autoFocus
                            {...form.getInputProps('token')}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') onSave();
                                if (event.key === 'Escape') onKeep();
                            }}
                        />
                        <Button
                            size="xs"
                            variant="subtle"
                            color="gray"
                            disabled={isSaving}
                            onClick={onKeep}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="xs"
                            disabled={values.token.trim() === ''}
                            loading={isSaving}
                            onClick={onSave}
                        >
                            Save
                        </Button>
                    </>
                ) : (
                    <Button size="xs" variant="default" onClick={onReplace}>
                        Replace
                    </Button>
                )}
                {tokenForm ? (
                    <Button
                        size="xs"
                        variant="default"
                        loading={test.isLoading}
                        onClick={() => handleTest(tokenForm)}
                    >
                        Test
                    </Button>
                ) : null}
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
    onDelete: () => void;
}> = ({ projectUuid, connection, reconnect, onDelete }) => {
    const params = {
        projectUuid,
        connectionUuid: connection.externalConnectionUuid,
    };
    const access = getLiveSourceAccess(connection);
    const accountField = getAccountField(access);
    const tokenLabel = getTokenLabel(access);
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
        initialValues: {
            ...toLiveSourceAccessValues(connection, access),
            ttl: String(getLiveSourceFreshness(connection).seconds),
        },
        validate: {
            name: (value) =>
                value.trim().length === 0 ? 'Name is required' : null,
            accountId: (value) => accountField?.validate(value) ?? null,
        },
    });

    // A window set through the API may not be one of the presets.
    const savedTtl = Number(form.getInitialValues().ttl);
    const ttlOptions = WINDOW_SECONDS.includes(savedTtl)
        ? WINDOW_SECONDS
        : [...WINDOW_SECONDS, savedTtl].sort((a, b) => a - b);

    const fieldsHint = fields?.scannedAt
        ? `Last refreshed ${formatDate(fields.scannedAt)}`
        : 'Never refreshed';

    const keepToken = () => {
        form.setFieldValue('token', '');
        setIsReplacingToken(false);
    };

    /** Saves the given settings over the saved ones, if they changed and are valid. */
    const saveSource = async (keys: (keyof LiveSourceAccessValues)[]) => {
        const saved = form.getInitialValues();
        const { values } = form;
        if (keys.every((key) => values[key].trim() === saved[key].trim()))
            return;
        if (keys.some((key) => form.validateField(key).hasError)) return;
        const changed = Object.fromEntries(
            keys.map((key) => [key, values[key].trim()]),
        );
        const next = { ...saved, ...changed };
        try {
            await updateSource.mutateAsync({
                ...params,
                data: toLiveSourceAccessUpdate(connection, access, next),
            });
        } catch {
            // The hook already says why; the field keeps what was typed.
            return;
        }
        form.setInitialValues({ ...next, token: '' });
        form.setValues({ ...changed, token: '' });
        setIsReplacingToken(false);
    };

    const saveOnEnter =
        (key: keyof LiveSourceAccessValues) =>
        (event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
                form.setFieldValue(key, form.getInitialValues()[key]);
                form.clearFieldError(key);
            }
        };

    const saveTtl = (value: string | null) => {
        if (!value || value === form.getInitialValues().ttl) return;
        const previous = form.getInitialValues().ttl;
        form.setFieldValue('ttl', value);
        updateCache.mutate(
            { ttlSeconds: Number(value) },
            {
                onSuccess: () =>
                    form.setInitialValues({
                        ...form.getInitialValues(),
                        ttl: value,
                    }),
                onError: () => form.setFieldValue('ttl', previous),
            },
        );
    };

    return (
        <>
            <Stack gap="lg">
                <SettingsCard title="Auth">
                    {accountField ? (
                        <SettingsRow
                            label={accountField.label}
                            hint={accountField.description}
                        >
                            <TextInput
                                w={240}
                                size="xs"
                                aria-label={accountField.label}
                                placeholder={accountField.placeholder}
                                {...form.getInputProps('accountId')}
                                onBlur={() => void saveSource(['accountId'])}
                                onKeyDown={saveOnEnter('accountId')}
                            />
                        </SettingsRow>
                    ) : null}
                    {tokenLabel ? (
                        <TokenRow
                            projectUuid={projectUuid}
                            connection={connection}
                            label={tokenLabel}
                            tokenForm={
                                access.kind === 'token' ? access.form : null
                            }
                            form={form}
                            isReplacing={isReplacingToken}
                            isSaving={updateSource.isLoading}
                            onReplace={() => setIsReplacingToken(true)}
                            onKeep={keepToken}
                            onSave={() => void saveSource(['token'])}
                        />
                    ) : (
                        <SettingsRow
                            label="Account"
                            hint={`Reads ${getApiSourceTarget(connection.apiSource)}`}
                        >
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
                            onBlur={() => void saveSource(['name'])}
                            onKeyDown={saveOnEnter('name')}
                        />
                    </SettingsRow>
                    {connection.liveSourceName ? (
                        <SettingsRow
                            label="Explore prefix"
                            hint="Names this source's explores. Can't be changed"
                        >
                            <Code className={classes.settingsCode}>
                                {connection.liveSourceName}
                            </Code>
                            <CopyActionIcon
                                value={connection.liveSourceName}
                                copyLabel="Copy explore prefix"
                                variant="subtle"
                                color="gray"
                                size="sm"
                            />
                        </SettingsRow>
                    ) : null}
                    <SettingsRow
                        label="AI hint"
                        hint="Helps agents pick this source"
                    >
                        <Textarea
                            w={240}
                            size="xs"
                            aria-label="AI hint"
                            placeholder="For example: EU storefront"
                            autosize
                            minRows={1}
                            maxRows={4}
                            maxLength={LIVE_SOURCE_AI_HINT_MAX_LENGTH}
                            {...form.getInputProps('aiHint')}
                            onBlur={() => void saveSource(['aiHint'])}
                        />
                    </SettingsRow>
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
                        label="Cache results for"
                        hint={
                            <>
                                {formatPurgedAt(connection.cachePurgedAt)}
                                <ProjectCacheOffAlert
                                    projectUuid={projectUuid}
                                />
                            </>
                        }
                    >
                        <Select
                            w={116}
                            size="xs"
                            aria-label="Cache results for"
                            allowDeselect={false}
                            comboboxProps={{ withinPortal: true }}
                            data={ttlOptions.map((option) => ({
                                value: String(option),
                                label: formatFreshness(option),
                            }))}
                            value={form.values.ttl}
                            disabled={updateCache.isLoading}
                            onChange={saveTtl}
                        />
                        <Button
                            size="xs"
                            variant="default"
                            loading={purge.isLoading}
                            onClick={() => setIsPurgeOpen(true)}
                        >
                            Clear cache
                        </Button>
                    </SettingsRow>
                </SettingsCard>

                <SettingsCard title="Danger zone">
                    <SettingsRow
                        label="Delete live data source"
                        hint="Charts that use it will stop working"
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
            </Stack>

            <MantineModal
                opened={isPurgeOpen}
                onClose={() => setIsPurgeOpen(false)}
                title="Clear cache?"
                role="alertdialog"
                description={`The next query to "${connection.name}" fetches fresh data.`}
                confirmLabel="Clear"
                confirmLoading={purge.isLoading}
                onConfirm={() =>
                    purge.mutate(undefined, {
                        onSettled: () => setIsPurgeOpen(false),
                    })
                }
            />
        </>
    );
};
