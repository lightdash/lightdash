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

// Regex to detect Slack IDs: C (public channel), G (private channel), U/W (user/DM)
const SLACK_ID_REGEX = /^[CGUW][A-Z0-9]{8,}$/i;

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
    const [lookedUpChannels, setLookedUpChannels] = useState<
        Map<string, string>
    >(new Map());

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

    // Only allow creating items that look like Slack channel IDs
    const shouldAllowCreate = (query: string) => SLACK_ID_REGEX.test(query);

    return props.multiple ? (
        <MultiSelect
            {...(commonProps as MultiSelectProps)}
            creatable
            shouldCreate={shouldAllowCreate}
            getCreateLabel={(query) =>
                SLACK_ID_REGEX.test(query)
                    ? `Look up channel ID: ${query}`
                    : 'Paste a Slack channel ID (e.g., C01234567)'
            }
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
                return undefined;
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
