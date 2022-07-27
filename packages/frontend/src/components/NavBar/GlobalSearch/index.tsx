import {
    Button,
    Colors,
    InputGroup,
    KeyCombo,
    MenuItem,
    Spinner,
    Tag,
} from '@blueprintjs/core';
import { ItemPredicate, ItemRenderer } from '@blueprintjs/select';
import { getSearchResultId } from '@lightdash/common';
import React, { FC, useState } from 'react';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import { useToggle } from 'react-use';
import { SearchOmnibar } from './globalSearch.styles';
import {
    SearchItem,
    useDebouncedSearch,
    useGlobalSearchHotKeys,
} from './hooks';

const renderItem: ItemRenderer<SearchItem> = (
    field,
    { modifiers, handleClick },
) => {
    if (!modifiers.matchesPredicate) {
        return null;
    }
    return (
        <MenuItem
            key={getSearchResultId(field.meta)}
            selected={modifiers.active}
            disabled={modifiers.disabled}
            icon={field.icon}
            text={
                <>
                    {field.prefix}
                    <b>{field.name}</b>
                    <span style={{ marginLeft: 10, color: Colors.GRAY1 }}>
                        {field.description}
                    </span>
                </>
            }
            title={field.description}
            onClick={handleClick}
            shouldDismissPopover={false}
        />
    );
};

const filterSearch: ItemPredicate<SearchItem> = (query, item) => {
    return (
        `${item.name.toLowerCase()} ${item.description?.toLowerCase()}`.indexOf(
            query.toLowerCase(),
        ) >= 0
    );
};

const GlobalSearch: FC = () => {
    const history = useHistory();
    const location = useLocation();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [isSearchOpen, toggleSearchOpen] = useToggle(false);
    const [query, setQuery] = useState<string>();
    useGlobalSearchHotKeys(toggleSearchOpen);
    const { items, isSearching } = useDebouncedSearch(projectUuid, query);
    return (
        <>
            <InputGroup
                leftIcon="search"
                onClick={() => toggleSearchOpen(true)}
                placeholder="Search..."
                style={{
                    width: 200,
                }}
                value={query}
                rightElement={
                    query ? (
                        <Button icon="cross" onClick={() => setQuery('')} />
                    ) : (
                        <Tag minimal>
                            <KeyCombo combo="mod+k" minimal />
                        </Tag>
                    )
                }
            />
            <SearchOmnibar
                inputProps={{
                    leftElement: isSearching ? (
                        <Spinner size={16} style={{ margin: 12 }} />
                    ) : undefined,
                }}
                isOpen={isSearchOpen}
                itemRenderer={renderItem}
                query={query}
                items={query && query.length > 2 ? items : []}
                itemsEqual={(a, b) =>
                    getSearchResultId(a.meta) === getSearchResultId(b.meta)
                }
                initialContent={
                    <MenuItem
                        disabled={true}
                        text={`${
                            !query ? 'Start' : 'Keep'
                        } typing to search everything in the project`}
                    />
                }
                noResults={
                    <MenuItem
                        disabled={true}
                        text={
                            !query || query.length < 3
                                ? `${
                                      !query ? 'Start' : 'Keep'
                                  } typing to search everything in the project`
                                : isSearching
                                ? 'Searching...'
                                : 'No results.'
                        }
                    />
                }
                onItemSelect={(item: SearchItem) => {
                    toggleSearchOpen(false);
                    history.push(item.location);
                    if (location.pathname.includes('/tables/')) {
                        history.go(0); // force page refresh so explore page can pick up the new url params
                    }
                }}
                onClose={() => toggleSearchOpen(false)}
                resetOnSelect={true}
                onQueryChange={(value) => setQuery(value)}
                itemPredicate={filterSearch}
            />
        </>
    );
};

export default GlobalSearch;
