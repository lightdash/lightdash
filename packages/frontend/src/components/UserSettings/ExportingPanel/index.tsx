import {
    FeatureFlags,
    type OrganizationSettings,
    type UpdateOrganizationSettings,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Checkbox,
    Group,
    Loader,
    NumberInput,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import useHealth from '../../../hooks/health/useHealth';
import {
    useOrganizationSettings,
    useUpdateOrganizationSettings,
} from '../../../hooks/organization/useOrganizationSettings';
import { useGetSlack } from '../../../hooks/slack/useSlack';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import MantineIcon from '../../common/MantineIcon';

const SECONDS_PER_DAY = 86400;
// Generous UI guardrail. There's no backend cap: longer links transparently
// use the persistent-download-URL system.
const MAX_DAYS = 365;

// '' models "inherit the base" for an optional per-channel input.
type DaysValue = number | '';

const CHANNELS = [
    { key: 'email', label: 'Email' },
    { key: 'slack', label: 'Slack' },
    { key: 'msteams', label: 'Microsoft Teams' },
    { key: 'googlechat', label: 'Google Chat' },
] as const;

type ChannelKey = (typeof CHANNELS)[number]['key'];

const toDays = (seconds: number | null): DaysValue =>
    seconds === null ? '' : Math.max(1, Math.round(seconds / SECONDS_PER_DAY));

const toSeconds = (days: DaysValue): number | null =>
    days === '' ? null : days * SECONDS_PER_DAY;

/**
 * Editable form for the org's exporting settings. Split out from the panel so
 * the form's initial values are captured from the loaded settings exactly once
 * (keyed remount on the effective values), never clobbered by a refetch.
 *
 * `availableChannels` are the delivery methods actually configured for this org
 * (Slack installed, Teams/Email enabled, Google Chat flag) — we only show a
 * per-channel override for methods the org can use. Hidden channels keep any
 * stored override (we never clear it just because the UI doesn't render it).
 */
const ExportingForm: FC<{
    settings: OrganizationSettings;
    availableChannels: ReadonlyArray<(typeof CHANNELS)[number]>;
}> = ({ settings, availableChannels }) => {
    const update = useUpdateOrganizationSettings();

    // Base is an effective number (resolved against the env); per-channel
    // overrides are raw (null = inherit the base).
    const initialChannels: Record<ChannelKey, number | null> = {
        email: settings.scheduledDeliveryExpirationSecondsEmail,
        slack: settings.scheduledDeliveryExpirationSecondsSlack,
        msteams: settings.scheduledDeliveryExpirationSecondsMsTeams,
        googlechat: settings.scheduledDeliveryExpirationSecondsGoogleChat,
    };
    const initial = {
        base: Math.max(
            1,
            Math.round(
                (settings.scheduledDeliveryExpirationSeconds ??
                    SECONDS_PER_DAY) / SECONDS_PER_DAY,
            ),
        ) as DaysValue,
        // The section opens pre-expanded only if an override already exists.
        perChannelEnabled: CHANNELS.some(
            (c) => initialChannels[c.key] !== null,
        ),
        email: toDays(initialChannels.email),
        slack: toDays(initialChannels.slack),
        msteams: toDays(initialChannels.msteams),
        googlechat: toDays(initialChannels.googlechat),
    };

    const form = useForm({ initialValues: initial });

    const baseDays = form.values.base === '' ? 1 : form.values.base;

    // What we'd persist for each channel: the typed value when overrides are
    // on, otherwise null (everything inherits the base).
    const effectiveChannelSeconds = (key: ChannelKey): number | null =>
        form.values.perChannelEnabled ? toSeconds(form.values[key]) : null;

    const handleSubmit = form.onSubmit(() => {
        const patch: UpdateOrganizationSettings = {
            scheduledDeliveryExpirationSeconds: baseDays * SECONDS_PER_DAY,
            scheduledDeliveryExpirationSecondsEmail:
                effectiveChannelSeconds('email'),
            scheduledDeliveryExpirationSecondsSlack:
                effectiveChannelSeconds('slack'),
            scheduledDeliveryExpirationSecondsMsTeams:
                effectiveChannelSeconds('msteams'),
            scheduledDeliveryExpirationSecondsGoogleChat:
                effectiveChannelSeconds('googlechat'),
        };
        update.mutate(patch);
    });

    const isUnchanged =
        baseDays === initial.base &&
        CHANNELS.every(
            (c) => effectiveChannelSeconds(c.key) === initialChannels[c.key],
        );

    return (
        <form onSubmit={handleSubmit}>
            <Stack gap="lg">
                <NumberInput
                    label="Download link expiry"
                    description="How long a scheduled delivery's download links stay valid before they expire."
                    suffix=" days"
                    min={1}
                    max={MAX_DAYS}
                    clampBehavior="strict"
                    allowDecimal={false}
                    allowNegative={false}
                    {...form.getInputProps('base')}
                />

                {availableChannels.length > 0 && (
                    <>
                        <Checkbox
                            label="Set a different expiry for specific channels"
                            description="When off, every channel uses the expiry above."
                            {...form.getInputProps('perChannelEnabled', {
                                type: 'checkbox',
                            })}
                        />

                        {form.values.perChannelEnabled && (
                            <Stack gap="xs">
                                {availableChannels.map((channel) => {
                                    const isOverridden =
                                        form.values[channel.key] !== '';
                                    return (
                                        <Group
                                            key={channel.key}
                                            gap="sm"
                                            wrap="nowrap"
                                        >
                                            <Text w={120} fz="sm">
                                                {channel.label}
                                            </Text>
                                            <NumberInput
                                                aria-label={`${channel.label} link expiry`}
                                                placeholder={`Inherits ${baseDays} days`}
                                                suffix=" days"
                                                min={1}
                                                max={MAX_DAYS}
                                                clampBehavior="strict"
                                                allowDecimal={false}
                                                allowNegative={false}
                                                hideControls
                                                flex={1}
                                                rightSection={
                                                    isOverridden ? (
                                                        <Tooltip label="Clear — inherit the expiry above">
                                                            <ActionIcon
                                                                variant="subtle"
                                                                color="gray"
                                                                size="sm"
                                                                onClick={() =>
                                                                    form.setFieldValue(
                                                                        channel.key,
                                                                        '',
                                                                    )
                                                                }
                                                            >
                                                                <MantineIcon
                                                                    icon={IconX}
                                                                />
                                                            </ActionIcon>
                                                        </Tooltip>
                                                    ) : null
                                                }
                                                rightSectionPointerEvents={
                                                    isOverridden
                                                        ? 'all'
                                                        : 'none'
                                                }
                                                {...form.getInputProps(
                                                    channel.key,
                                                )}
                                            />
                                        </Group>
                                    );
                                })}
                            </Stack>
                        )}
                    </>
                )}

                <Group justify="flex-end">
                    <Button
                        type="submit"
                        loading={update.isLoading}
                        disabled={isUnchanged}
                    >
                        Save
                    </Button>
                </Group>
            </Stack>
        </form>
    );
};

const ExportingPanel: FC = () => {
    const { data, isInitialLoading } = useOrganizationSettings();
    const health = useHealth();
    const { data: slackInstallation } = useGetSlack();
    const { data: googleChatFlag } = useServerFeatureFlag(
        FeatureFlags.GoogleChatEnabled,
    );

    if (isInitialLoading || !data) {
        return <Loader />;
    }

    // Only offer a per-channel override for delivery methods the org can use.
    const isAvailable: Record<ChannelKey, boolean> = {
        email: health.data?.hasEmailClient ?? false,
        slack: !!slackInstallation?.organizationUuid,
        msteams: health.data?.hasMicrosoftTeams ?? false,
        googlechat: googleChatFlag?.enabled === true,
    };
    const availableChannels = CHANNELS.filter((c) => isAvailable[c.key]);

    // Remount when the effective values change so the form re-seeds from server
    // state without a clobbering useEffect.
    return (
        <ExportingForm
            key={[
                data.scheduledDeliveryExpirationSeconds,
                data.scheduledDeliveryExpirationSecondsEmail,
                data.scheduledDeliveryExpirationSecondsSlack,
                data.scheduledDeliveryExpirationSecondsMsTeams,
                data.scheduledDeliveryExpirationSecondsGoogleChat,
            ].join('-')}
            settings={data}
            availableChannels={availableChannels}
        />
    );
};

export default ExportingPanel;
