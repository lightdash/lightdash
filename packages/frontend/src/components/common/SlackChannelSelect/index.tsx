import {
    ActionIcon,
    Loader,
    MultiSelect,
    Select,
    Tooltip,
    type MultiSelectProps,
    type SelectProps,
} from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import { useSlackChannels } from '../../../hooks/slack/useSlack';
import MantineIcon from '../MantineIcon';

type CommonProps = {
    disabled?: SelectProps['disabled'];
    placeholder?: SelectProps['placeholder'];
    label?: SelectProps['label'];
    size?: SelectProps['size'];
    /** Show refresh button to force re-fetch channels from Slack */
    withRefresh?: boolean;
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
    } = props;

    const [search, setSearch] = useState<string | undefined>(undefined);

    // Accumulate channels across searches so selected channels remain in options
    const channelCacheRef = useRef<Map<string, string>>(new Map());

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
            excludeDms: true,
            excludeGroups: true,
            includeChannelIds,
        },
        { enabled: !disabled },
    );

    // Add fetched channels to cache
    useEffect(() => {
        slackChannels?.forEach((channel) => {
            channelCacheRef.current.set(channel.id, channel.name);
        });
    }, [slackChannels]);

    const options = useMemo(() => {
        const optionsMap = new Map<string, string>();

        // Add all cached channels first
        channelCacheRef.current.forEach((name, id) => {
            optionsMap.set(id, name);
        });

        // Add/update with current search results
        slackChannels?.forEach((channel) => {
            optionsMap.set(channel.id, channel.name);
        });

        return Array.from(optionsMap.entries()).map(([id, name]) => ({
            value: id,
            label: name,
        }));
    }, [slackChannels]);

    const isBusy = isLoading || isRefreshing;

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

    return props.multiple ? (
        <MultiSelect
            {...(commonProps as MultiSelectProps)}
            creatable
            getCreateLabel={(query) => `Send to private channel #${query}`}
            onCreate={(newItem) => {
                // Add private channel to cache with # prefix for display
                channelCacheRef.current.set(newItem, `#${newItem}`);
                return newItem;
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
