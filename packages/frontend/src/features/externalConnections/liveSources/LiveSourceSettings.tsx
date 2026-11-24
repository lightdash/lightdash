/**
 * One live data source's settings, below its summary on its own page. Rows
 * of a label on the left and its control on the right: how it signs in
 * (account, access), what it is (name, AI hint), its data (fields and
 * caching), then deleting it. A card of fields saves with its Save changes,
 * a choice or button as soon as it is used.
 */
import {
    LIVE_SOURCE_AI_HINT_MAX_LENGTH,
    LIVE_SOURCE_CACHE_TTL_MAX_SECONDS,
} from '@lightdash/common';
import {
    Button,
    Code,
    Group,
    PasswordInput,
    SegmentedControl,
    Select,
    Stack,
    Textarea,
    TextInput,
} from '@mantine/core';
import { useForm, type UseFormReturnType } from '@mantine/form';
import { IconTrash } from '@tabler/icons-react';
import { useState, type FC, type FormEvent } from 'react';
import { Link } from 'react-router';
import { CopyActionIcon } from '../../../components/common/CopyActionIcon';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { useResultsCacheStatus } from '../../../hooks/useProjectResultsCacheSettings';
import {
    usePurgeLiveSourceCache,
    useUpdateLiveSourceCache,
} from '../hooks/useLiveSourceCache';
import { useLiveSourceFields } from '../hooks/useLiveSourceFields';
import { useTestConnection } from '../hooks/useTestConnection';
import {
    LIVE_SOURCE_UPDATE_MESSAGES,
    useUpdateExternalConnection,
} from '../hooks/useUpdateExternalConnection';
import {
    getAccountField,
    getLiveSourceAccess,
    getLiveSourceTestRequest,
    getTokenLabel,
    toLiveSourceAccessUpdate,
    toLiveSourceAccessValues,
    type LiveSourceAccessValues,
} from './liveSourceAccess';
import { getApiSourceTarget } from './liveSourceCatalog';
import { LiveSourceRateLimitsCard } from './LiveSourceRateLimits';
import {
    formatFreshness,
    getLiveSourceFreshness,
    type LiveSourceConnection,
} from './liveSourceRows';
import classes from './LiveSources.module.css';
import { SettingsCard, SettingsRow } from './LiveSourceSettingsRows';
import rowClasses from './LiveSourceSettingsRows.module.css';
import { LiveSourceTestRow } from './LiveSourceTestRow';

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

/** The saved token, or a new one typed in its place to save with the card. */
const TokenRow: FC<{
    label: string;
    form: UseFormReturnType<Values>;
}> = ({ label, form }) => (
    <SettingsRow label={label} hint="Saved and encrypted, never shown again">
        <PasswordInput
            size="xs"
            w={240}
            aria-label={`New ${label}`}
            placeholder="Leave empty to keep the saved key"
            autoComplete="off"
            {...form.getInputProps('token')}
        />
    </SettingsRow>
);

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
    const isPostHogKey = access.kind === 'posthogKey';
    const tokenLabel = getTokenLabel(access);
    /** What the Access card saves together, the new token included. */
    const accessKeys: (keyof LiveSourceAccessValues)[] = [
        ...(accountField ? (['accountId'] as const) : []),
        ...(isPostHogKey ? (['region'] as const) : []),
        ...(tokenLabel ? (['token'] as const) : []),
    ];
    const { data: fields } = useLiveSourceFields(params);
    const purge = usePurgeLiveSourceCache(params);
    const updateCache = useUpdateLiveSourceCache(params);
    const updateSource = useUpdateExternalConnection(
        LIVE_SOURCE_UPDATE_MESSAGES,
    );
    const testSource = useTestConnection({ showErrorToast: false });
    const [isPurgeOpen, setIsPurgeOpen] = useState(false);
    const { data: projectCache } = useResultsCacheStatus(projectUuid);
    /** The project doesn't cache results, so the source has nothing to tune or clear. */
    const isProjectCacheOff = projectCache?.enabled === false;

    const form = useForm<Values>({
        initialValues: {
            ...toLiveSourceAccessValues(connection, access),
            ttl: String(getLiveSourceFreshness(connection)),
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

    /** Saves the given settings over the saved ones, if they changed and are valid. */
    const saveSource = async (keys: (keyof LiveSourceAccessValues)[]) => {
        const saved = form.getInitialValues();
        const { values } = form;
        if (keys.every((key) => values[key].trim() === saved[key].trim()))
            return;
        if (keys.some((key) => form.validateField(key).hasError)) return;
        if (keys.includes('region') && needsKeyForRegion()) return;
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
        // Another card's save leaves a key typed into Access in place
        if (!keys.includes('token')) {
            form.setValues(changed);
            return;
        }
        form.setValues({ ...changed, token: '' });
    };

    const isChanged = (keys: (keyof LiveSourceAccessValues)[]) =>
        keys.some(
            (key) =>
                form.values[key].trim() !== form.getInitialValues()[key].trim(),
        );

    /** A saved key is never sent to another region, so moving needs a new one. */
    const needsKeyForRegion = () => {
        const { values } = form;
        if (
            values.region === form.getInitialValues().region ||
            values.token.trim() !== ''
        )
            return false;
        form.setFieldError('token', 'Enter a key for the new region');
        return true;
    };

    const isAccessChanged = accessKeys.length > 0 && isChanged(accessKeys);
    const testRequest = getLiveSourceTestRequest(
        connection,
        access,
        form.values,
    );

    /** Tests the Access card as edited, so a new key can be tried before saving. */
    const handleTest = () => {
        if (!testRequest) return;
        if (isAccessChanged) {
            if (accessKeys.some((key) => form.validateField(key).hasError))
                return;
            if (isPostHogKey && needsKeyForRegion()) return;
        }
        testSource.mutate({
            ...params,
            ...testRequest,
            ...(isAccessChanged
                ? {
                      config: toLiveSourceAccessUpdate(
                          connection,
                          access,
                          form.values,
                      ),
                  }
                : {}),
        });
    };

    const revert = (keys: (keyof LiveSourceAccessValues)[]) => {
        keys.forEach((key) => {
            form.setFieldValue(key, form.getInitialValues()[key]);
            form.clearFieldError(key);
        });
    };

    /** Cancel and Save changes under a card's editable rows. */
    const saveFooter = (keys: (keyof LiveSourceAccessValues)[]) => {
        const changed = isChanged(keys);
        return (
            <Group
                justify="flex-end"
                gap="xs"
                className={rowClasses.settingsFooter}
            >
                <Button
                    size="xs"
                    variant="default"
                    disabled={!changed || updateSource.isLoading}
                    onClick={() => revert(keys)}
                >
                    Cancel
                </Button>
                <Button
                    type="submit"
                    size="xs"
                    disabled={!changed}
                    loading={updateSource.isLoading}
                >
                    Save changes
                </Button>
            </Group>
        );
    };

    const submit =
        (keys: (keyof LiveSourceAccessValues)[]) => (event: FormEvent) => {
            event.preventDefault();
            void saveSource(keys);
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
                <SettingsCard
                    title="Access"
                    onSubmit={
                        accessKeys.length > 0 ? submit(accessKeys) : undefined
                    }
                >
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
                                autoComplete="off"
                                {...form.getInputProps('accountId')}
                            />
                        </SettingsRow>
                    ) : null}
                    {isPostHogKey ? (
                        <SettingsRow label="Region" hint="Where you log in">
                            <SegmentedControl
                                size="xs"
                                w={240}
                                data={[
                                    { value: 'us', label: 'US Cloud' },
                                    { value: 'eu', label: 'EU Cloud' },
                                ]}
                                {...form.getInputProps('region')}
                            />
                        </SettingsRow>
                    ) : null}
                    {tokenLabel ? (
                        <TokenRow label={tokenLabel} form={form} />
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
                    {isPostHogKey && reconnect ? (
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
                    {testRequest ? (
                        <LiveSourceTestRow
                            hint={
                                isAccessChanged
                                    ? 'Checks your unsaved changes above'
                                    : 'Checks the saved access'
                            }
                            test={testSource}
                            onTest={handleTest}
                            inputs={accessKeys.map((key) => form.values[key])}
                        />
                    ) : null}
                    {accessKeys.length > 0 ? saveFooter(accessKeys) : null}
                </SettingsCard>

                <SettingsCard
                    title="Details"
                    onSubmit={submit(['name', 'aiHint'])}
                >
                    {connection.liveSourceName ? (
                        <SettingsRow
                            label="Explore prefix"
                            hint="Added to the start of each explore name"
                        >
                            <Code className={rowClasses.settingsCode}>
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
                        />
                    </SettingsRow>
                    {saveFooter(['name', 'aiHint'])}
                </SettingsCard>

                <SettingsCard title="Data">
                    {/* Refreshing is the page header's main action */}
                    <SettingsRow label="Fields" hint={fieldsHint}>
                        {null}
                    </SettingsRow>
                    <SettingsRow
                        label="Caching"
                        hint={
                            isProjectCacheOff ? (
                                <span className={classes.warningText}>
                                    Currently disabled
                                </span>
                            ) : (
                                formatPurgedAt(connection.cachePurgedAt)
                            )
                        }
                    >
                        {isProjectCacheOff ? (
                            <Button
                                size="xs"
                                variant="default"
                                component={Link}
                                to={`/generalSettings/projectManagement/${projectUuid}/caching`}
                            >
                                Turn on
                            </Button>
                        ) : (
                            <>
                                <Select
                                    w={116}
                                    size="xs"
                                    aria-label="Caching"
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
                            </>
                        )}
                    </SettingsRow>
                </SettingsCard>

                <LiveSourceRateLimitsCard
                    projectUuid={projectUuid}
                    connectionUuid={connection.externalConnectionUuid}
                />

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
