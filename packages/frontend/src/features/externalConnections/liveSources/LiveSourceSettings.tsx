/**
 * One live data source's settings, below its summary on its own page. Rows
 * of a label on the left and its control on the right: how it signs in
 * (account, access), what it is (name, AI hint), its data (fields and
 * caching), then deleting it. A card reads until its Edit is used, then its
 * fields save with Save changes.
 */
import {
    LIVE_SOURCE_AI_HINT_MAX_LENGTH,
    LIVE_SOURCE_CACHE_TTL_MAX_SECONDS,
} from '@lightdash/common';
import {
    Button,
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
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { useResultsCacheStatus } from '../../../hooks/useProjectResultsCacheSettings';
import {
    usePurgeLiveSourceCache,
    useUpdateLiveSourceCache,
} from '../hooks/useLiveSourceCache';
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
import { LiveSourceAccessRuleModal } from './LiveSourceAccessRuleModal';
import { getApiSourceTarget } from './liveSourceCatalog';
import { LiveSourceRateLimitsCard } from './LiveSourceRateLimits';
import {
    describeLiveSourceAccessRule,
    formatFreshness,
    getLiveSourceFreshness,
    type LiveSourceConnection,
} from './liveSourceRows';
import classes from './LiveSources.module.css';
import {
    SettingsCard,
    SettingsRow,
    SettingsSaveFooter,
    SettingsValue,
} from './LiveSourceSettingsRows';
import { LiveSourceTagsCard } from './LiveSourceTagsCard';
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

const POSTHOG_REGIONS = [
    { value: 'us', label: 'US Cloud' },
    { value: 'eu', label: 'EU Cloud' },
];

type EditableCard = 'details' | 'caching' | 'access';

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
    const purge = usePurgeLiveSourceCache(params);
    const updateCache = useUpdateLiveSourceCache(params);
    const updateSource = useUpdateExternalConnection(
        LIVE_SOURCE_UPDATE_MESSAGES,
    );
    const testSource = useTestConnection({ showErrorToast: false });
    const [isPurgeOpen, setIsPurgeOpen] = useState(false);
    const [isAccessRuleOpen, setIsAccessRuleOpen] = useState(false);
    const [editingCards, setEditingCards] = useState<EditableCard[]>([]);
    const isEditing = (card: EditableCard) => editingCards.includes(card);
    const stopEditing = (card: EditableCard) =>
        setEditingCards((cards) => cards.filter((open) => open !== card));
    const editProps = (card: EditableCard) => ({
        isEditing: isEditing(card),
        onEdit: () => setEditingCards((cards) => [...cards, card]),
    });
    const accessRule = describeLiveSourceAccessRule(connection.accessRule);
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

    /**
     * Saves the given settings over the saved ones, if they changed and are
     * valid. False leaves them unsaved.
     */
    const saveSource = async (keys: (keyof LiveSourceAccessValues)[]) => {
        const saved = form.getInitialValues();
        const { values } = form;
        if (keys.every((key) => values[key].trim() === saved[key].trim()))
            return true;
        if (keys.some((key) => form.validateField(key).hasError)) return false;
        if (keys.includes('region') && needsKeyForRegion()) return false;
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
            return false;
        }
        form.setInitialValues({ ...next, token: '' });
        // Another card's save leaves a key typed into Access in place
        if (!keys.includes('token')) {
            form.setValues(changed);
            return true;
        }
        form.setValues({ ...changed, token: '' });
        return true;
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

    const saveFooter = (
        card: EditableCard,
        keys: (keyof LiveSourceAccessValues)[],
    ) =>
        isEditing(card) ? (
            <SettingsSaveFooter
                isChanged={isChanged(keys)}
                isSaving={updateSource.isLoading}
                hasFields={keys.length > 0}
                onCancel={() => {
                    revert(keys);
                    stopEditing(card);
                }}
            />
        ) : null;

    const submit =
        (card: EditableCard, keys: (keyof LiveSourceAccessValues)[]) =>
        (event: FormEvent) => {
            event.preventDefault();
            void saveSource(keys).then((isSaved) => {
                if (isSaved) stopEditing(card);
            });
        };

    const isTtlChanged = form.values.ttl !== form.getInitialValues().ttl;

    const cancelTtl = () => {
        form.setFieldValue('ttl', form.getInitialValues().ttl);
        stopEditing('caching');
    };

    const submitTtl = (event: FormEvent) => {
        event.preventDefault();
        if (!isTtlChanged) return;
        const { ttl } = form.values;
        updateCache.mutate(
            { ttlSeconds: Number(ttl) },
            {
                onSuccess: () => {
                    form.setInitialValues({ ...form.getInitialValues(), ttl });
                    stopEditing('caching');
                },
            },
        );
    };

    return (
        <>
            <Stack gap="lg">
                <SettingsCard
                    title="Details"
                    onSubmit={submit('details', ['name', 'aiHint'])}
                    edit={editProps('details')}
                >
                    <SettingsRow
                        label="Name"
                        hint="Shown in explores and to agents"
                    >
                        {isEditing('details') ? (
                            <TextInput
                                w={240}
                                size="xs"
                                autoFocus
                                aria-label="Name"
                                {...form.getInputProps('name')}
                            />
                        ) : (
                            <SettingsValue>{form.values.name}</SettingsValue>
                        )}
                    </SettingsRow>
                    <SettingsRow
                        label="AI hint"
                        hint="Helps agents pick this source"
                    >
                        {isEditing('details') ? (
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
                        ) : (
                            <SettingsValue isEmpty={!form.values.aiHint}>
                                {form.values.aiHint || 'Not set'}
                            </SettingsValue>
                        )}
                    </SettingsRow>
                    {saveFooter('details', ['name', 'aiHint'])}
                </SettingsCard>

                <SettingsCard
                    title="Who can query"
                    edit={{
                        isEditing: false,
                        onEdit: () => setIsAccessRuleOpen(true),
                    }}
                >
                    <SettingsRow label="Access rule">
                        <SettingsValue>
                            {accessRule
                                ? `Only people whose ${accessRule}`
                                : 'Everyone in the project'}
                        </SettingsValue>
                    </SettingsRow>
                </SettingsCard>

                <LiveSourceTagsCard
                    projectUuid={projectUuid}
                    connection={connection}
                />

                <SettingsCard
                    title="Caching"
                    onSubmit={submitTtl}
                    edit={isProjectCacheOff ? undefined : editProps('caching')}
                >
                    <SettingsRow
                        label="Keep results for"
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
                        ) : isEditing('caching') ? (
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
                                    disabled={updateCache.isLoading}
                                    {...form.getInputProps('ttl')}
                                />
                                <Button
                                    size="xs"
                                    variant="default"
                                    loading={purge.isLoading}
                                    onClick={() => setIsPurgeOpen(true)}
                                >
                                    Clear cached results
                                </Button>
                            </>
                        ) : (
                            <SettingsValue>
                                {formatFreshness(Number(form.values.ttl))}
                            </SettingsValue>
                        )}
                    </SettingsRow>
                    {!isProjectCacheOff && isEditing('caching') ? (
                        <SettingsSaveFooter
                            isChanged={isTtlChanged}
                            isSaving={updateCache.isLoading}
                            onCancel={cancelTtl}
                        />
                    ) : null}
                </SettingsCard>

                <LiveSourceRateLimitsCard
                    projectUuid={projectUuid}
                    connectionUuid={connection.externalConnectionUuid}
                />

                <SettingsCard
                    title="Access"
                    onSubmit={
                        accessKeys.length > 0
                            ? submit('access', accessKeys)
                            : undefined
                    }
                    edit={
                        accessKeys.length > 0 || reconnect
                            ? editProps('access')
                            : undefined
                    }
                >
                    {accountField ? (
                        <SettingsRow
                            label={accountField.label}
                            hint={accountField.description}
                        >
                            {isEditing('access') ? (
                                <TextInput
                                    w={240}
                                    size="xs"
                                    aria-label={accountField.label}
                                    placeholder={accountField.placeholder}
                                    autoComplete="off"
                                    {...form.getInputProps('accountId')}
                                />
                            ) : (
                                <SettingsValue isEmpty={!form.values.accountId}>
                                    {form.values.accountId || 'Not set'}
                                </SettingsValue>
                            )}
                        </SettingsRow>
                    ) : null}
                    {isPostHogKey ? (
                        <SettingsRow label="Region" hint="Where you log in">
                            {isEditing('access') ? (
                                <SegmentedControl
                                    size="xs"
                                    w={240}
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
                        isEditing('access') ? (
                            <TokenRow label={tokenLabel} form={form} />
                        ) : (
                            <SettingsRow
                                label={tokenLabel}
                                hint="Encrypted, never shown again"
                            >
                                <SettingsValue>Saved</SettingsValue>
                            </SettingsRow>
                        )
                    ) : (
                        <SettingsRow
                            label="Account"
                            hint={`Reads ${getApiSourceTarget(connection.apiSource)}`}
                        >
                            {reconnect && isEditing('access') ? (
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
                    {isPostHogKey && reconnect && isEditing('access') ? (
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
                    {saveFooter('access', accessKeys)}
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

            {isAccessRuleOpen ? (
                <LiveSourceAccessRuleModal
                    projectUuid={projectUuid}
                    connection={connection}
                    onClose={() => setIsAccessRuleOpen(false)}
                />
            ) : null}
            <MantineModal
                opened={isPurgeOpen}
                onClose={() => setIsPurgeOpen(false)}
                title="Clear cached results?"
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
