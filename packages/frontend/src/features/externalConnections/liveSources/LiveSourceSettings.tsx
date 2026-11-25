/**
 * One live data source's settings, below its summary on its own page. Rows
 * of a label on the left and its control on the right: how it signs in
 * (account, access), what it is (name, AI hint, tags), its data (fields and
 * caching), then deleting it. A card reads until its Edit is used, then its
 * fields save with Save changes.
 */
import {
    LIVE_SOURCE_AI_HINT_MAX_LENGTH,
    LIVE_SOURCE_CACHE_TTL_MAX_SECONDS,
} from '@lightdash/common';
import {
    Button,
    Code,
    PasswordInput,
    SegmentedControl,
    Select,
    Stack,
    Textarea,
    TextInput,
} from '@mantine/core';
import { useForm, type UseFormReturnType } from '@mantine/form';
import { IconId, IconKey, IconTrash } from '@tabler/icons-react';
import { isEqual } from 'es-toolkit/compat';
import { useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { useResultsCacheStatus } from '../../../hooks/useProjectResultsCacheSettings';
import { useExternalConnectionApiUsage } from '../hooks/useExternalConnectionApiUsage';
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
import { LiveSourceAccessRuleModal } from './LiveSourceAccessRuleModal';
import { getApiSourceTarget } from './liveSourceCatalog';
import { LiveSourceRateLimitsCard } from './LiveSourceRateLimits';
import {
    describeLiveSourceAccessRule,
    formatFreshness,
    getLiveSourceFreshness,
    toLiveSourceRow,
    type LiveSourceConnection,
} from './liveSourceRows';
import classes from './LiveSources.module.css';
import {
    EditableSettingsCard,
    SettingsCard,
    SettingsRow,
    SettingsValue,
} from './LiveSourceSettingsRows';
import { LiveSourceTagsRow } from './LiveSourceTagsRow';
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

type EditableCard = 'details' | 'access';

/** The Details fields held as text, saved with the tags. */
const DETAIL_KEYS: (keyof LiveSourceAccessValues)[] = ['name', 'aiHint'];

const formatDate = (date: Date | string) =>
    new Date(date).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    });

type Values = LiveSourceAccessValues & {
    /** Seconds, as the select holds it. */
    ttl: string;
    tags: string[];
};

/** The saved token, or a new one typed in its place to save with the card. */
const TokenRow: FC<{
    label: string;
    form: UseFormReturnType<Values>;
}> = ({ label, form }) => (
    <SettingsRow label={label} hint="Encrypted, never shown again">
        <PasswordInput
            size="xs"
            w={320}
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
    const testDraftSource = useTestConnection({ showErrorToast: false });
    const [isPurgeOpen, setIsPurgeOpen] = useState(false);
    const [isAccessRuleOpen, setIsAccessRuleOpen] = useState(false);
    const [editingCards, setEditingCards] = useState<EditableCard[]>([]);
    const isEditing = (card: EditableCard) => editingCards.includes(card);
    const stopEditing = (card: EditableCard) =>
        setEditingCards((cards) => cards.filter((open) => open !== card));
    const startEditing = (card: EditableCard) =>
        setEditingCards((cards) => [...cards, card]);
    const accessRule = describeLiveSourceAccessRule(connection.accessRule);
    const { data: projectCache } = useResultsCacheStatus(projectUuid);
    const { data: apiUsage } = useExternalConnectionApiUsage(projectUuid);
    const { data: fields } = useLiveSourceFields(params);
    const { usage } = toLiveSourceRow(connection, apiUsage);
    const windowDays = apiUsage?.[0]?.windowDays;
    /** False until the source has been called, so its rows read as empty. */
    const sourceUsage = apiUsage?.find(
        ({ externalConnectionUuid }) =>
            externalConnectionUuid === connection.externalConnectionUuid,
    );
    const hasUsage = (sourceUsage?.apiCalls ?? 0) > 0;
    const cacheHits = sourceUsage?.cacheHits ?? 0;
    const cacheLookups = sourceUsage?.queries ?? 0;
    const hitRate =
        cacheLookups > 0 ? Math.round((cacheHits / cacheLookups) * 100) : 0;
    const usageWindow =
        windowDays === undefined
            ? 'Usage over the query history retention window'
            : `Usage over the last ${windowDays} days`;
    /** The project doesn't cache results, so the source has nothing to tune or clear. */
    const isProjectCacheOff = projectCache?.enabled === false;

    const form = useForm<Values>({
        initialValues: {
            ...toLiveSourceAccessValues(connection, access),
            ttl: String(getLiveSourceFreshness(connection)),
            tags: connection.tags ?? [],
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
     * valid, and the tags when given. False leaves them unsaved.
     */
    const saveSource = async (
        keys: (keyof LiveSourceAccessValues)[],
        tags?: string[],
    ) => {
        const saved = form.getInitialValues();
        const { values } = form;
        if (
            !tags &&
            keys.every((key) => values[key].trim() === saved[key].trim())
        )
            return true;
        if (keys.some((key) => form.validateField(key).hasError)) return false;
        if (keys.includes('region') && needsKeyForRegion()) return false;
        const changed = Object.fromEntries(
            keys.map((key) => [key, values[key].trim()]),
        );
        const next = { ...saved, ...changed, ...(tags ? { tags } : {}) };
        try {
            await updateSource.mutateAsync({
                ...params,
                data: {
                    ...toLiveSourceAccessUpdate(connection, access, next),
                    ...(tags ? { tags } : {}),
                },
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
    /** The page tests what is saved; the dialog, what is typed in it. */
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
        if (!savedTestRequest) return;
        testSource.mutate({ ...params, ...savedTestRequest });
    };

    /** Tries the Authentication dialog as edited, before anything is saved. */
    const testDraft = () => {
        if (!draftTestRequest) return;
        if (isAccessChanged) {
            if (accessKeys.some((key) => form.validateField(key).hasError))
                return;
            if (isPostHogKey && needsKeyForRegion()) return;
        }
        testDraftSource.mutate({
            ...params,
            ...draftTestRequest,
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

    const isTagsChanged = !isEqual(
        form.values.tags,
        form.getInitialValues().tags,
    );

    const cancelDetails = () => {
        revert(DETAIL_KEYS);
        form.setFieldValue('tags', form.getInitialValues().tags);
        stopEditing('details');
    };

    const saveDetails = () => {
        void saveSource(
            DETAIL_KEYS,
            isTagsChanged ? form.values.tags : undefined,
        ).then((isSaved) => {
            if (isSaved) stopEditing('details');
        });
    };

    /** One choice with nothing to review, so it saves as soon as it is made. */
    const saveTtl = (ttl: string | null) => {
        if (ttl === null || ttl === form.values.ttl) return;
        const saved = form.values.ttl;
        form.setFieldValue('ttl', ttl);
        updateCache.mutate(
            { ttlSeconds: Number(ttl) },
            {
                onSuccess: () =>
                    form.setInitialValues({ ...form.getInitialValues(), ttl }),
                onError: () => form.setFieldValue('ttl', saved),
            },
        );
    };

    return (
        <>
            <Stack gap="lg">
                <EditableSettingsCard
                    title="Details"
                    icon={IconId}
                    isEditing={isEditing('details')}
                    onEdit={() => startEditing('details')}
                    onCancel={cancelDetails}
                    onSave={saveDetails}
                    isChanged={isChanged(DETAIL_KEYS) || isTagsChanged}
                    isSaving={updateSource.isLoading}
                >
                    {(editing) => (
                        <>
                            <SettingsRow
                                label="Explore prefix"
                                hint="Starts the name of each explore, and can't be changed"
                            >
                                {editing ? (
                                    <TextInput
                                        w={320}
                                        size="xs"
                                        aria-label="Explore prefix"
                                        disabled
                                        value={connection.liveSourceName ?? ''}
                                        readOnly
                                    />
                                ) : (
                                    <Code fz="xs">
                                        {connection.liveSourceName ?? '—'}
                                    </Code>
                                )}
                            </SettingsRow>
                            <SettingsRow
                                label="Name"
                                hint="Shown in explores and to AI agents"
                            >
                                {editing ? (
                                    <TextInput
                                        w={320}
                                        size="xs"
                                        autoFocus
                                        aria-label="Name"
                                        {...form.getInputProps('name')}
                                    />
                                ) : (
                                    <SettingsValue>
                                        {form.values.name}
                                    </SettingsValue>
                                )}
                            </SettingsRow>
                            <SettingsRow
                                label="AI hint"
                                hint="Helps AI agents pick this source"
                            >
                                {editing ? (
                                    <Textarea
                                        w={320}
                                        size="xs"
                                        aria-label="AI hint"
                                        placeholder="For example: EU storefront"
                                        autosize
                                        minRows={1}
                                        maxRows={4}
                                        maxLength={
                                            LIVE_SOURCE_AI_HINT_MAX_LENGTH
                                        }
                                        {...form.getInputProps('aiHint')}
                                    />
                                ) : (
                                    <SettingsValue
                                        isEmpty={!form.values.aiHint}
                                    >
                                        {form.values.aiHint || 'Not set'}
                                    </SettingsValue>
                                )}
                            </SettingsRow>
                            <LiveSourceTagsRow
                                isEditing={editing}
                                tags={form.values.tags}
                                onChange={(tags) =>
                                    form.setFieldValue('tags', tags)
                                }
                            />
                        </>
                    )}
                </EditableSettingsCard>

                <SettingsCard title="Usage" titleInfo={usageWindow}>
                    <SettingsRow
                        label="Charts"
                        hint="Saved charts on this source"
                    >
                        <SettingsValue isNumber isEmpty={!fields}>
                            {fields?.usedByChartCount.toLocaleString() ?? '—'}
                        </SettingsValue>
                    </SettingsRow>
                    <SettingsRow
                        label="Data read"
                        hint="Returned by the integration"
                    >
                        <SettingsValue isNumber isEmpty={!hasUsage}>
                            {hasUsage ? usage.dataRead : '—'}
                        </SettingsValue>
                    </SettingsRow>
                    <SettingsRow
                        label="API calls"
                        hint="Requests sent to the integration"
                    >
                        <SettingsValue isNumber isEmpty={!hasUsage}>
                            {hasUsage ? usage.apiCalls : '—'}
                        </SettingsValue>
                    </SettingsRow>
                    <SettingsRow
                        label="Median latency"
                        hint="How long a typical call takes"
                    >
                        <SettingsValue isNumber isEmpty={!usage.medianLatency}>
                            {usage.medianLatency ?? '—'}
                        </SettingsValue>
                    </SettingsRow>
                </SettingsCard>

                <SettingsCard title="Caching">
                    <SettingsRow
                        label={isProjectCacheOff ? 'Caching' : 'Duration'}
                        hint={
                            isProjectCacheOff ? (
                                <span className={classes.warningText}>
                                    Off for this project
                                </span>
                            ) : (
                                'How long results are reused'
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
                            <Select
                                w={116}
                                size="xs"
                                aria-label="Caching"
                                allowDeselect={false}
                                comboboxProps={{ withinPortal: true }}
                                data={ttlOptions.map((option) => ({
                                    value: String(option),
                                    label:
                                        option === 0
                                            ? 'No caching'
                                            : formatFreshness(option),
                                }))}
                                disabled={updateCache.isLoading}
                                value={form.values.ttl}
                                onChange={saveTtl}
                            />
                        )}
                    </SettingsRow>
                    {isProjectCacheOff ? null : (
                        <>
                            <SettingsRow
                                label="Hit rate"
                                hint="Queries served from cache"
                            >
                                <SettingsValue
                                    isNumber
                                    isEmpty={cacheLookups === 0}
                                >
                                    {cacheLookups > 0 ? `${hitRate}%` : '—'}
                                </SettingsValue>
                            </SettingsRow>
                            <SettingsRow
                                label="Last cleared"
                                hint="Results from before this are not reused"
                            >
                                <SettingsValue
                                    isEmpty={!connection.cachePurgedAt}
                                >
                                    {connection.cachePurgedAt
                                        ? formatDate(connection.cachePurgedAt)
                                        : 'Never'}
                                </SettingsValue>
                            </SettingsRow>
                            <SettingsRow
                                label="Clear cache"
                                hint="The next query fetches fresh data"
                            >
                                <Button
                                    size="xs"
                                    variant="default"
                                    loading={purge.isLoading}
                                    onClick={() => setIsPurgeOpen(true)}
                                >
                                    Clear
                                </Button>
                            </SettingsRow>
                        </>
                    )}
                </SettingsCard>

                <LiveSourceRateLimitsCard
                    projectUuid={projectUuid}
                    connectionUuid={connection.externalConnectionUuid}
                />

                <SettingsCard
                    title="Access"
                    edit={{
                        isEditing: false,
                        onEdit: () => setIsAccessRuleOpen(true),
                    }}
                >
                    {/* The same rows as the dialog that edits it */}
                    <SettingsRow
                        label="Query access"
                        // Says which it is; the dialog's caption offers both
                        hint={
                            accessRule
                                ? 'Limited by user attribute'
                                : 'Open to the whole project'
                        }
                    >
                        <SettingsValue>
                            {accessRule ? 'Restricted' : 'Everyone'}
                        </SettingsValue>
                    </SettingsRow>
                    {(
                        [
                            ['required', 'Must match all'],
                            ['any', 'Must match any'],
                        ] as const
                    ).flatMap(([key, group]) =>
                        Object.entries(connection.accessRule?.[key] ?? {}).map(
                            ([name, values]) => (
                                <SettingsRow
                                    key={`${key}:${name}`}
                                    label={name}
                                    hint={group}
                                >
                                    {values.map((value) => (
                                        <Code key={value} fz="xs">
                                            {value}
                                        </Code>
                                    ))}
                                </SettingsRow>
                            ),
                        ),
                    )}
                </SettingsCard>

                <EditableSettingsCard
                    title="Authentication"
                    icon={IconKey}
                    canEdit={accessKeys.length > 0 || reconnect !== null}
                    isEditing={isEditing('access')}
                    onEdit={() => startEditing('access')}
                    onCancel={() => {
                        revert(accessKeys);
                        stopEditing('access');
                    }}
                    onSave={
                        accessKeys.length > 0
                            ? () =>
                                  void saveSource(accessKeys).then(
                                      (isSaved) => {
                                          if (isSaved) stopEditing('access');
                                      },
                                  )
                            : undefined
                    }
                    isChanged={isChanged(accessKeys)}
                    isSaving={updateSource.isLoading}
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
                                            w={320}
                                            size="xs"
                                            aria-label={accountField.label}
                                            placeholder={
                                                accountField.placeholder
                                            }
                                            autoComplete="off"
                                            {...form.getInputProps('accountId')}
                                        />
                                    ) : form.values.accountId ? (
                                        <Code fz="xs">
                                            {form.values.accountId}
                                        </Code>
                                    ) : (
                                        <SettingsValue isEmpty>
                                            Not set
                                        </SettingsValue>
                                    )}
                                </SettingsRow>
                            ) : null}
                            {isPostHogKey ? (
                                <SettingsRow
                                    label="Region"
                                    hint="Where you log in"
                                >
                                    {editing ? (
                                        <SegmentedControl
                                            size="xs"
                                            w={320}
                                            data={POSTHOG_REGIONS}
                                            {...form.getInputProps('region')}
                                        />
                                    ) : (
                                        <SettingsValue>
                                            {
                                                POSTHOG_REGIONS.find(
                                                    ({ value }) =>
                                                        value ===
                                                        form.values.region,
                                                )?.label
                                            }
                                        </SettingsValue>
                                    )}
                                </SettingsRow>
                            ) : null}
                            {tokenLabel ? (
                                editing ? (
                                    <TokenRow label={tokenLabel} form={form} />
                                ) : (
                                    <SettingsRow
                                        label={tokenLabel}
                                        hint="Encrypted, never shown again"
                                    >
                                        {/* A note that a key exists, not the key: dimmed like "Never" */}
                                        <SettingsValue isEmpty>
                                            Saved
                                        </SettingsValue>
                                    </SettingsRow>
                                )
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
                            {/* On the page it tests what is saved; in the dialog, what is typed */}
                            {savedTestRequest && !editing ? (
                                <LiveSourceTestRow
                                    label="Status"
                                    hint="Runs a quick check"
                                    test={testSource}
                                    onTest={testSaved}
                                    inputs={accessKeys.map(
                                        (key) => form.getInitialValues()[key],
                                    )}
                                />
                            ) : draftTestRequest && editing ? (
                                <LiveSourceTestRow
                                    label="Status"
                                    hint="Checks the details above, without saving"
                                    test={testDraftSource}
                                    onTest={testDraft}
                                    inputs={accessKeys.map(
                                        (key) => form.values[key],
                                    )}
                                />
                            ) : editing ? null : (
                                <SettingsRow
                                    label="Status"
                                    hint="No test for this integration yet"
                                >
                                    <Button
                                        size="xs"
                                        variant="default"
                                        disabled
                                    >
                                        Test
                                    </Button>
                                </SettingsRow>
                            )}
                        </>
                    )}
                </EditableSettingsCard>

                <SettingsCard title="Danger zone" tone="danger">
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
