import { SLACK_ID_REGEX } from '@lightdash/common';
import {
    ActionIcon,
    Loader,
    MultiSelect,
    Select,
    Tooltip,
    type MultiSelectProps,
    type SelectProps,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconRefresh } from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FC } from 'react';
import {
    useSlackChannelLookup,
    useSlackChannels,
} from '../../../hooks/slack/useSlack';
import MantineIcon from '../MantineIcon';

type CommonProps = {
    disabled?: SelectProps['disabled'];
    placeholder?: SelectProps['placeholder'];
    label?: SelectProps['label'];
    size?: SelectProps['size'];
    /** Show refresh button to force re-fetch channels from Slack */
    withRefresh?: boolean;
    /** Include direct messages in the channel list */
    includeDms?: boolean;
};

type SingleSelectProps = CommonProps & {
    multiple?: false;
    value: string | null | undefined;
    onChange: (value: string | null) => void;
};

type MultiSelectComponentProps = CommonProps & {
    multiple: true;
    value: string[];
    onChange: (value: string[]) => void;
};

export const SlackChannelSelect: FC<
    SingleSelectProps | MultiSelectComponentProps
> = (props) => {
    const {
        disabled = false,
        placeholder = 'Select a channel',
        label,
        size = 'xs',
        withRefresh = false,
        includeDms = false,
    } = props;

    const [search, setSearch] = useState<string | undefined>(undefined);
    const [debouncedSearch] = useDebouncedValue(search, 300);

    // Track looked-up channels (ID -> name) that aren't in the cached list yet
    // Initialize with any existing channel names (not Slack IDs) so they display when editing
    const [lookedUpChannels, setLookedUpChannels] = useState<
        Map<string, string>
    >(() => {
        const initial = new Map<string, string>();
        const values = props.multiple
            ? props.value
            : props.value
            ? [props.value]
            : [];
        values
            .filter((v) => !SLACK_ID_REGEX.test(v))
            .forEach((name) => {
                initial.set(name, `#${name}`);
            });
        return initial;
    });

    // On-demand lookup for pasted channel IDs not in DB cache
    const { mutate: lookupChannel, isLoading: isLookingUp } =
        useSlackChannelLookup();

    const includeChannelIds = useMemo(() => {
        if (props.multiple) {
            return props.value.length > 0 ? props.value : undefined;
        }
        return props.value ? [props.value] : undefined;
    }, [props.multiple, props.value]);

    const {
        data: slackChannels,
        isFetching: isLoading,
        refresh,
        isRefreshing,
    } = useSlackChannels(
        search || '',
        {
            excludeArchived: true,
            excludeDms: !includeDms,
            excludeGroups: true,
            includeChannelIds,
        },
        { enabled: !disabled },
    );

    // On-demand lookup when user pastes a Slack channel ID
    useEffect(() => {
        if (!debouncedSearch || !SLACK_ID_REGEX.test(debouncedSearch)) return;

        // Check if already in fetched channels
        const alreadyHaveChannel = slackChannels?.some(
            (c) => c.id === debouncedSearch,
        );
        if (alreadyHaveChannel) return;

        // Lookup the channel by ID
        lookupChannel(debouncedSearch);
    }, [debouncedSearch, slackChannels, lookupChannel]);

    const options = useMemo(() => {
        const optionsMap = new Map<string, string>();

        // Add looked-up channels first
        lookedUpChannels.forEach((name, id) => {
            optionsMap.set(id, name);
        });

        // Add channels from API (will override looked-up if same ID)
        slackChannels?.forEach((channel) => {
            optionsMap.set(channel.id, channel.name);
        });

        return Array.from(optionsMap.entries()).map(([id, name]) => ({
            value: id,
            label: name,
        }));
    }, [slackChannels, lookedUpChannels]);

    const isBusy = isLoading || isRefreshing || isLookingUp;

    const rightSection = withRefresh ? (
        isBusy ? (
            <Loader size="xs" />
        ) : (
            <Tooltip label="Refresh Slack channels" withArrow withinPortal>
                <ActionIcon variant="transparent" onClick={refresh}>
                    <MantineIcon icon={IconRefresh} />
                </ActionIcon>
            </Tooltip>
        )
    ) : isBusy ? (
        <Loader size="xs" />
    ) : undefined;

    const commonProps = {
        label,
        size,
        rightSection,
        placeholder: isBusy ? 'Loading channels...' : placeholder,
        nothingFound: 'No channels found',
        data: options,
        searchable: true,
        clearable: true,
        disabled,
        onSearchChange: setSearch,
    };

    // Allow creating items that look like Slack channel IDs or channel names
    const shouldAllowCreate = (query: string) => {
        // Allow Slack IDs (C01234567, G01234567, etc.)
        if (SLACK_ID_REGEX.test(query)) return true;
        // Allow channel names (at least 1 character, no spaces at start/end)
        const trimmed = query.trim();
        return trimmed.length > 0 && trimmed === query;
    };

    // Normalize channel name (remove # prefix if present)
    const normalizeChannelName = (name: string) => {
        const trimmed = name.trim();
        return trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
    };

    return props.multiple ? (
        <MultiSelect
            radius="md"
            {...(commonProps as MultiSelectProps)}
            creatable
            shouldCreate={shouldAllowCreate}
            getCreateLabel={(query) => {
                if (SLACK_ID_REGEX.test(query)) {
                    return `Look up channel ID: ${query}`;
                }
                const normalized = normalizeChannelName(query);
                return `Send to private channel: #${normalized}`;
            }}
            onCreate={(newItem) => {
                if (SLACK_ID_REGEX.test(newItem)) {
                    // Trigger lookup to get channel info
                    lookupChannel(newItem, {
                        onSuccess: (channel) => {
                            if (channel) {
                                // Add to looked-up channels so it appears in options
                                setLookedUpChannels((prev) => {
                                    const next = new Map(prev);
                                    next.set(channel.id, channel.name);
                                    return next;
                                });
                                // Add the channel ID to the selection
                                props.onChange([...props.value, channel.id]);
                            }
                        },
                    });
                    // Don't add anything yet - wait for lookup to complete
                    return undefined;
                }
                // For channel names, normalize and add directly
                // The backend will resolve the name to an ID when posting
                const normalized = normalizeChannelName(newItem);
                setLookedUpChannels((prev) => {
                    const next = new Map(prev);
                    next.set(normalized, `#${normalized}`);
                    return next;
                });
                return normalized;
            }}
            value={props.value}
            onChange={(newValue) => {
                props.onChange(newValue);
                setSearch(undefined);
            }}
        />
    ) : (
        <Select
            {...(commonProps as SelectProps)}
            value={props.value ?? null}
            onChange={(newValue) => {
                props.onChange(newValue);
                setSearch(undefined);
            }}
        />
    );
};
