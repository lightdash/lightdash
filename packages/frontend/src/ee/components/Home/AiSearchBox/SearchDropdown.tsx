import {
    ActionIcon,
    Combobox,
    Group,
    Loader,
    ScrollArea,
    TextInput,
    useCombobox,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconX } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import OmnibarItem from '../../../../features/omnibar/components/OmnibarItem';
import { getSearchResultsGroupsSorted } from '../../../../features/omnibar/components/utils';
import useSearch, {
    OMNIBAR_MIN_QUERY_LENGTH,
} from '../../../../features/omnibar/hooks/useSearch';
import { type SearchItem } from '../../../../features/omnibar/types/searchItem';
import { getSearchItemLabel } from '../../../../features/omnibar/utils/getSearchItemLabel';
import { useValidationUserAbility } from '../../../../hooks/validation/useValidation';
import styles from './SearchDropdown.module.css';

type Props = {
    projectUuid: string;
    value: string;
    onChange: (value: string) => void;
    onSearchItemSelect?: (item: SearchItem) => void;
    placeholder?: string;
    footer?: React.ReactNode;
    header?: React.ReactNode;
    onHeaderClick?: () => void;
};

export const SearchDropdown: FC<Props> = ({
    projectUuid,
    value,
    onChange,
    onSearchItemSelect,
    placeholder,
    footer,
    header,
    onHeaderClick,
}) => {
    const navigate = useNavigate();
    const canUserManageValidation = useValidationUserAbility(projectUuid);
    const combobox = useCombobox({
        onDropdownClose: () => combobox.resetSelectedOption(),
    });

    const [debouncedQuery] = useDebouncedValue(value, 200);
    const { data: searchResults, isFetching } = useSearch({
        projectUuid,
        query: debouncedQuery,
        keepPreviousData: true,
        source: 'ai_search_box',
    });

    const allSearchItemsGrouped = useMemo(
        () =>
            searchResults ? getSearchResultsGroupsSorted(searchResults) : [],
        [searchResults],
    );

    const allSearchItems: SearchItem[] = useMemo(() => {
        if (!searchResults) return [];
        return Object.values(searchResults).flat();
    }, [searchResults]);

    const handleSearchItemClick = (item: SearchItem) => {
        void navigate(item.location.pathname + (item.location.search || ''));
        onSearchItemSelect?.(item);
        combobox.closeDropdown();
    };

    const handleInputChange = (newValue: string) => {
        onChange(newValue);
        if (newValue.length >= OMNIBAR_MIN_QUERY_LENGTH) {
            combobox.openDropdown();
        } else {
            combobox.closeDropdown();
        }
    };

    return (
        <Combobox
            store={combobox}
            classNames={{
                option: styles.comboboxOption,
            }}
        >
            <Combobox.Target>
                <Combobox.EventsTarget>
                    <TextInput
                        placeholder={placeholder}
                        value={value}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            handleInputChange(e.currentTarget.value)
                        }
                        rightSection={
                            isFetching ? (
                                <Loader size={12} color="gray" />
                            ) : value.trim().length > 0 ? (
                                <ActionIcon
                                    onClick={() => onChange('')}
                                    variant="transparent"
                                    size="xs"
                                    color="ldGray.5"
                                >
                                    <MantineIcon icon={IconX} />
                                </ActionIcon>
                            ) : null
                        }
                        autoFocus
                        classNames={{
                            root: styles.searchRoot,
                            input: styles.searchInput,
                        }}
                    />
                </Combobox.EventsTarget>
            </Combobox.Target>

            <Combobox.Dropdown>
                <Combobox.Options>
                    {header && (
                        <Combobox.Header
                            p={0}
                            className={styles.comboboxHeader}
                        >
                            <Combobox.Option
                                key="combobox-header"
                                value="combobox-header"
                                p={0}
                                onClick={onHeaderClick}
                                selected
                            >
                                {header}
                            </Combobox.Option>
                        </Combobox.Header>
                    )}
                    <ScrollArea.Autosize
                        maw="100%"
                        mah={300}
                        type="scroll"
                        scrollbars="y"
                        className={styles.searchDropdownScrollContent}
                    >
                        {isFetching ? (
                            <Combobox.Empty>
                                <Group
                                    align="center"
                                    justify="flex-start"
                                    gap="xs"
                                >
                                    <Loader size={12} />
                                    Loading search results
                                </Group>
                            </Combobox.Empty>
                        ) : (
                            allSearchItems.length === 0 && (
                                <Combobox.Empty>
                                    No matching search results
                                </Combobox.Empty>
                            )
                        )}

                        {allSearchItemsGrouped.map(([groupType, items], i) => (
                            <Combobox.Group
                                key={groupType}
                                label={getSearchItemLabel(groupType)}
                            >
                                {items.map((item, j) => (
                                    <Combobox.Option
                                        key={`${i}-${j}`}
                                        value={`${item.type}-${item.title}`}
                                        onClick={() =>
                                            handleSearchItemClick(item)
                                        }
                                    >
                                        <OmnibarItem
                                            projectUuid={projectUuid}
                                            canUserManageValidation={
                                                canUserManageValidation
                                            }
                                            item={item}
                                        />
                                    </Combobox.Option>
                                ))}
                            </Combobox.Group>
                        ))}
                    </ScrollArea.Autosize>
                </Combobox.Options>
                {footer && (
                    <Combobox.Footer p={0} style={{ overflow: 'hidden' }}>
                        {footer}
                    </Combobox.Footer>
                )}
            </Combobox.Dropdown>
        </Combobox>
    );
};
