import { SLACK_ID_REGEX } from '@lightdash/common';
import {
    ActionIcon,
    Combobox,
    Loader,
    Pill,
    PillsInput,
    ScrollArea,
    Tooltip,
    useCombobox,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconRefresh, IconX } from '@tabler/icons-react';
import compact from 'lodash/compact';
import uniq from 'lodash/uniq';
import { useMemo, useState, type FC } from 'react';
import {
    useSlackChannelLookup,
    useSlackChannels,
} from '../../../hooks/slack/useSlack';
import useToaster from '../../../hooks/toaster/useToaster';
import MantineIcon from '../MantineIcon';
import classes from './SlackChannelSelect.module.css';

type CommonProps = {
    disabled?: boolean;
    placeholder?: string;
    label?: React.ReactNode;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    /** Show refresh button to force re-fetch channels from Slack */
    withRefresh?: boolean;
    /** Include direct messages in the channel list */
    includeDms?: boolean;
    /** Include private channels (groups) in the channel list */
    includeGroups?: boolean;
    variant?: 'subtle' | undefined;
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

// Helper to normalize single/multiple values to array
const normalizeValues = (
    multiple: boolean | undefined,
    value: string | null | undefined | string[],
): string[] => {
    return compact(multiple ? (value as string[]) : [value as string | null]);
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
        includeGroups = false,
    } = props;

    const values = normalizeValues(props.multiple, props.value);

    const [search, setSearch] = useState('');
    const [debouncedSearch] = useDebouncedValue(search, 300);

    const combobox = useCombobox({
        onDropdownClose: () => {
            combobox.resetSelectedOption();
            setSearch('');
        },
        onDropdownOpen: () => combobox.updateSelectedOptionIndex('active'),
    });

    // Track looked-up channels (ID -> name) that aren't in the cached list yet
    const [lookedUpChannels, setLookedUpChannels] = useState<
        Map<string, string>
    >(() => new Map());

    // On-demand lookup for pasted channel IDs not in DB cache
    const { mutate: lookupChannel, isLoading: isLookingUp } =
        useSlackChannelLookup();

    const { showToastInfo } = useToaster();

    const {
        data: slackChannels,
        isFetching: isLoading,
        refresh,
        isRefreshing,
    } = useSlackChannels(
        debouncedSearch || '',
        {
            excludeArchived: true,
            excludeDms: !includeDms,
            excludeGroups: !includeGroups,
            includeChannelIds: values.length > 0 ? values : undefined,
        },
        { enabled: !disabled, keepPreviousData: true },
    );

    const allOptions = useMemo(() => {
        const channelsById = new Map([
            ...lookedUpChannels,
            ...(slackChannels?.map((c) => [c.id, c.name] as const) ?? []),
        ]);

        return Array.from(channelsById, ([id, name]) => ({
            value: id,
            label: name,
        }));
    }, [slackChannels, lookedUpChannels]);

    const filteredOptions = useMemo(() => {
        const trimmedSearch = search.trim();
        if (!trimmedSearch) {
            return allOptions.filter((opt) => !values.includes(opt.value));
        }

        const searchLower = trimmedSearch.toLowerCase();
        return allOptions.filter(
            (opt) =>
                !values.includes(opt.value) &&
                (opt.label.toLowerCase().includes(searchLower) ||
                    opt.value.toLowerCase().includes(searchLower)),
        );
    }, [allOptions, values, search]);

    const isBusy = isLoading || isRefreshing || isLookingUp;

    const getLabel = (value: string) => {
        const option = allOptions.find((opt) => opt.value === value);
        return option?.label ?? value;
    };

    const handleValueSelect = (val: string) => {
        if (props.multiple) {
            props.onChange(uniq([...props.value, val]));
        } else {
            props.onChange(val);
            combobox.closeDropdown();
        }
    };

    const handleValueRemove = (val: string) => {
        if (props.multiple) {
            props.onChange(props.value.filter((v) => v !== val));
        } else {
            props.onChange(null);
        }
    };

    const addLookedUpChannel = (id: string, name: string) => {
        setLookedUpChannels((prev) => {
            const next = new Map(prev);
            next.set(id, name);
            return next;
        });
    };

    const trimmedSearch = search.trim();
    const showLookup =
        trimmedSearch !== '' && SLACK_ID_REGEX.test(trimmedSearch);

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
    ) : !props.multiple && values.length > 0 ? (
        <ActionIcon
            onClick={(event) => {
                event.stopPropagation();
                handleValueRemove(values[0]);
            }}
            variant="transparent"
            color="gray"
        >
            <MantineIcon icon={IconX} size="sm" />
        </ActionIcon>
    ) : undefined;

    const pills = values.map((value) => {
        const isIdValue = SLACK_ID_REGEX.test(value);
        const pillLabel = getLabel(value);
        /**
         * NOTE: we used to support adding channels by name because we performed a full channel lookup.
         * This is now deprecated and the new system has smart lookup support by ID.
         * To handle the transition, we display a special pill to notify users. This is still supported by backend, but
         * we plan to remove it eventually.
         */
        const isUncached = !isBusy && !isIdValue;

        return (
            <Tooltip
                key={value}
                label={
                    "We couldn't find this channel and the integration may not be installed correctly. Please use the channel ID instead."
                }
                withArrow
                withinPortal
                disabled={!isUncached}
            >
                <Pill
                    className={classes.pill}
                    data-uncached={isUncached}
                    data-single-mode={!props.multiple}
                    key={value}
                    withRemoveButton={props.multiple}
                    onRemove={() => handleValueRemove(value)}
                >
                    {pillLabel}
                </Pill>
            </Tooltip>
        );
    });

    const handleOptionSubmit = (val: string) => {
        if (val === '__lookup__') {
            lookupChannel(trimmedSearch, {
                onSuccess: (channel) => {
                    if (channel) {
                        addLookedUpChannel(channel.id, channel.name);
                        handleValueSelect(channel.id);
                    } else {
                        showToastInfo({
                            title: 'Channel not found',
                            subtitle: `Could not find channel with ID "${trimmedSearch}". If it's a private channel, make sure the Lightdash integration is added first.`,
                        });
                    }
                },
            });
        } else {
            handleValueSelect(val);
        }
        setSearch('');
    };

    return (
        <Combobox
            store={combobox}
            onOptionSubmit={handleOptionSubmit}
            disabled={disabled}
        >
            <Combobox.DropdownTarget>
                <PillsInput
                    size={size}
                    label={label}
                    description={
                        includeGroups
                            ? 'To add a private channel, first add the Lightdash integration to that channel and use the Channel ID here.'
                            : undefined
                    }
                    rightSection={rightSection}
                    onClick={() => !disabled && combobox.openDropdown()}
                    disabled={disabled}
                    variant={props.variant}
                >
                    <Pill.Group>
                        {pills}
                        <Combobox.EventsTarget>
                            <PillsInput.Field
                                onFocus={() =>
                                    !disabled && combobox.openDropdown()
                                }
                                value={search}
                                placeholder={
                                    values.length === 0
                                        ? isBusy
                                            ? 'Loading channels...'
                                            : placeholder
                                        : undefined
                                }
                                onChange={(event) => {
                                    combobox.updateSelectedOptionIndex();
                                    setSearch(event.currentTarget.value);
                                }}
                                onKeyDown={(event) => {
                                    if (
                                        event.key === 'Backspace' &&
                                        search.length === 0 &&
                                        values.length > 0
                                    ) {
                                        event.preventDefault();
                                        handleValueRemove(
                                            values[values.length - 1],
                                        );
                                    }
                                }}
                                disabled={disabled}
                            />
                        </Combobox.EventsTarget>
                    </Pill.Group>
                </PillsInput>
            </Combobox.DropdownTarget>

            <Combobox.Dropdown>
                <ScrollArea.Autosize mah={220} type="scroll">
                    <Combobox.Options>
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((option) => (
                                <Combobox.Option
                                    value={option.value}
                                    key={option.value}
                                    active={values.includes(option.value)}
                                >
                                    {option.label}
                                </Combobox.Option>
                            ))
                        ) : showLookup ? null : (
                            <Combobox.Empty>
                                No channels found, try using Channel ID instead?
                            </Combobox.Empty>
                        )}
                        {showLookup && (
                            <Combobox.Option value="__lookup__">
                                Look up channel ID: {search}
                            </Combobox.Option>
                        )}
                    </Combobox.Options>
                </ScrollArea.Autosize>
            </Combobox.Dropdown>
        </Combobox>
    );
};
