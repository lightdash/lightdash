import {
    Combobox,
    Group,
    Loader,
    ScrollArea,
    TextInput,
    useCombobox,
    type TextInputProps,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useMemo, type FC } from 'react';
import { useNavigate } from 'react-router';
import OmnibarItem from '../../../../features/omnibar/components/OmnibarItem';
import { getSearchResultsGroupsSorted } from '../../../../features/omnibar/components/utils';
import useSearch, {
    OMNIBAR_MIN_QUERY_LENGTH,
} from '../../../../features/omnibar/hooks/useSearch';
import { type SearchItem } from '../../../../features/omnibar/types/searchItem';
import { getSearchItemLabel } from '../../../../features/omnibar/utils/getSearchItemLabel';
import { useValidationUserAbility } from '../../../../hooks/validation/useValidation';
// eslint-disable-next-line css-modules/no-unused-class
import styles from './aiSearchBox.module.css';

type Props = {
    projectUuid: string;
    value: string;
    onChange: (value: string) => void;
    onSearchItemSelect?: (item: SearchItem) => void;
    placeholder?: string;
    footer?: React.ReactNode;
    inputProps?: TextInputProps;
};

export const SearchDropdown: FC<Props> = ({
    projectUuid,
    value,
    onChange,
    onSearchItemSelect,
    placeholder,
    inputProps,
    footer,
}) => {
    const navigate = useNavigate();
    const canUserManageValidation = useValidationUserAbility(projectUuid);
    const combobox = useCombobox({
        onDropdownClose: () => combobox.resetSelectedOption(),
    });

    const [debouncedQuery] = useDebouncedValue(value, 200);
    const {
        data: searchResults,
        isSuccess,
        isFetching,
    } = useSearch({
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
                        {...inputProps}
                        placeholder={placeholder}
                        value={value}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            handleInputChange(e.currentTarget.value)
                        }
                        rightSection={
                            isFetching && <Loader size={12} color="gray" />
                        }
                    />
                </Combobox.EventsTarget>
            </Combobox.Target>

            <Combobox.Dropdown>
                <Combobox.Options>
                    <ScrollArea.Autosize
                        maw="100%"
                        mah={300}
                        type="scroll"
                        scrollbars="y"
                        className={styles.searchDropdownScrollContent}
                    >
                        {!isSuccess ? (
                            <Combobox.Empty>
                                <Group align="center" justify="center" gap="xs">
                                    <Loader size={12} color="gray" />
                                    Loading results
                                </Group>
                            </Combobox.Empty>
                        ) : (
                            allSearchItems.length === 0 && (
                                <Combobox.Empty>Nothing found</Combobox.Empty>
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
