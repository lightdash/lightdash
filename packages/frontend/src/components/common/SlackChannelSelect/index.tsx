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
import { useEffect, useMemo, useState, type FC } from 'react';
import {
    useSlackChannelLookup,
    useSlackChannels,
} from '../../../hooks/slack/useSlack';
import MantineIcon from '../MantineIcon';

type ChannelOption = {
    value: string;
    label: string;
};

type SlackChannelOptionsProps = {
    filteredOptions: ChannelOption[];
    selectedValues: string[];
    showCreateOption: boolean;
    search: string;
    normalizeChannelName: (name: string) => string;
};

const SlackChannelOptions: FC<SlackChannelOptionsProps> = ({
    filteredOptions,
    selectedValues,
    showCreateOption,
    search,
    normalizeChannelName,
}) => {
    return (
        <>
            {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                    <Combobox.Option
                        value={option.value}
                        key={option.value}
                        active={selectedValues.includes(option.value)}
                    >
                        {option.label}
                    </Combobox.Option>
                ))
            ) : showCreateOption ? null : (
                <Combobox.Empty>No channels found</Combobox.Empty>
            )}
            {showCreateOption && (
                <Combobox.Option value="__create__">
                    {SLACK_ID_REGEX.test(search)
                        ? `Look up channel ID: ${search}`
                        : `Send to private channel: #${normalizeChannelName(
                              search,
                          )}`}
                </Combobox.Option>
            )}
        </>
    );
};

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

// Helper to initialize lookedUpChannels with channel names from initial value
const initializeLookedUpChannels = (
    multiple: boolean | undefined,
    value: string | null | undefined | string[],
): Map<string, string> => {
    const initial = new Map<string, string>();
    const initialValues = normalizeValues(multiple, value);
    initialValues
        .filter((v) => !SLACK_ID_REGEX.test(v))
        .forEach((name) => {
            initial.set(name, `#${name}`);
        });
    return initial;
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

    const values = useMemo(
        () => normalizeValues(props.multiple, props.value),
        [props.multiple, props.value],
    );

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
    // Initialize with any existing channel names (not Slack IDs) so they display when editing
    const [lookedUpChannels, setLookedUpChannels] = useState<
        Map<string, string>
    >(() => initializeLookedUpChannels(props.multiple, props.value));

    // On-demand lookup for pasted channel IDs not in DB cache
    const { mutate: lookupChannel, isLoading: isLookingUp } =
        useSlackChannelLookup();

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
        { enabled: !disabled },
    );

    // On-demand lookup when user pastes a Slack channel ID
    useEffect(() => {
        if (
            !debouncedSearch ||
            debouncedSearch.trim() === '' ||
            !SLACK_ID_REGEX.test(debouncedSearch)
        )
            return;

        // Check if already in fetched channels
        const alreadyHaveChannel = slackChannels?.some(
            (c) => c.id === debouncedSearch,
        );
        if (alreadyHaveChannel) return;

        // Lookup the channel by ID
        lookupChannel(debouncedSearch);
    }, [debouncedSearch, slackChannels, lookupChannel]);

    const allOptions = useMemo(() => {
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

    const filteredOptions = useMemo(() => {
        if (!search || search.trim() === '') {
            return allOptions.filter((opt) => !values.includes(opt.value));
        }

        const searchLower = search.toLowerCase().trim();
        return allOptions.filter(
            (opt) =>
                !values.includes(opt.value) &&
                (opt.label.toLowerCase().includes(searchLower) ||
                    opt.value.toLowerCase().includes(searchLower)),
        );
    }, [allOptions, values, search]);

    const isBusy = isLoading || isRefreshing || isLookingUp;

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

    const getLabel = (value: string) => {
        const option = allOptions.find((opt) => opt.value === value);
        return option?.label ?? value;
    };

    const handleValueSelect = (val: string) => {
        if (props.multiple) {
            if (values.includes(val)) {
                props.onChange(props.value.filter((v) => v !== val));
            } else {
                props.onChange([...props.value, val]);
            }
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

    const handleCreateItem = (newItem: string) => {
        if (SLACK_ID_REGEX.test(newItem)) {
            // Trigger lookup to get channel info
            lookupChannel(newItem, {
                onSuccess: (channel) => {
                    if (channel) {
                        addLookedUpChannel(channel.id, channel.name);
                        handleValueSelect(channel.id);
                    }
                },
            });
        } else {
            // For channel names, normalize and add directly
            // The backend will resolve the name to an ID when posting
            const normalized = normalizeChannelName(newItem);
            addLookedUpChannel(normalized, `#${normalized}`);
            handleValueSelect(normalized);
        }
    };

    // Check if search query should show "create" option
    const exactMatch = filteredOptions.some(
        (opt) =>
            opt.label.toLowerCase() === search.toLowerCase().trim() ||
            opt.value.toLowerCase() === search.toLowerCase().trim(),
    );
    const showCreateOption =
        search.trim() !== '' && !exactMatch && shouldAllowCreate(search);

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

    const pills = values.map((value) => (
        <Pill
            styles={
                props.multiple
                    ? {}
                    : // When single option, remove al pills styles to make it look like a select
                      {
                          root: {
                              background: 'none',
                              padding: 0,
                              fontSize: 'var(--pill-fz-sm)',
                          },
                      }
            }
            key={value}
            withRemoveButton={props.multiple}
            onRemove={() => handleValueRemove(value)}
        >
            {getLabel(value)}
        </Pill>
    ));

    const handleOptionSubmit = (val: string) => {
        if (val === '__create__') {
            handleCreateItem(search);
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
                                onBlur={() => combobox.closeDropdown()}
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
                        <SlackChannelOptions
                            filteredOptions={filteredOptions}
                            selectedValues={values}
                            showCreateOption={showCreateOption}
                            search={search}
                            normalizeChannelName={normalizeChannelName}
                        />
                    </Combobox.Options>
                </ScrollArea.Autosize>
            </Combobox.Dropdown>
        </Combobox>
    );
};
