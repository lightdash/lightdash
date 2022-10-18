import { Spinner } from '@blueprintjs/core';
import { MenuItem2, Popover2Props } from '@blueprintjs/popover2';
import { ItemRenderer, Suggest2 } from '@blueprintjs/select';
import { FilterableField, getItemId } from '@lightdash/common';
import React, { FC, useCallback } from 'react';
import { Hightlighed } from '../../../../NavBar/GlobalSearch/globalSearch.styles';
import HighlightedText from '../../../HighlightedText';
import { useFiltersContext } from '../../FiltersProvider';
import { itemPredicate, useAutoComplete } from './autoCompleteUtils';

type Props2 = {
    field: FilterableField;
    value: string;
    suggestions: string[];
    onChange: (values: string) => void;
    popoverProps?: Popover2Props;
    disabled?: boolean;
};

const StyledSpinner = () => <Spinner size={16} style={{ margin: 12 }} />;

const AutoComplete: FC<Props2> = ({
    value,
    field,
    suggestions,
    popoverProps,
    disabled,
    onChange,
}) => {
    const { projectUuid } = useFiltersContext();
    const { options, setSearch, isSearching, isFetchingInitialData } =
        useAutoComplete(value, suggestions, getItemId(field), projectUuid);

    const renderItem: ItemRenderer<string> = useCallback(
        (name, { modifiers, handleClick, query }) => {
            if (!modifiers.matchesPredicate) {
                return null;
            }
            return (
                <MenuItem2
                    active={modifiers.active}
                    icon={value === name ? 'tick' : 'blank'}
                    key={name}
                    text={
                        <HighlightedText
                            text={name}
                            query={query}
                            highlightElement={Hightlighed}
                        />
                    }
                    onClick={handleClick}
                    shouldDismissPopover={false}
                />
            );
        },
        [value],
    );

    const renderCreateOption = useCallback(
        (
            q: string,
            active: boolean,
            handleClick: React.MouseEventHandler<HTMLElement>,
        ) =>
            !isSearching ? (
                <MenuItem2
                    icon="add"
                    text={`Add "${q}"`}
                    active={active}
                    onClick={handleClick}
                    shouldDismissPopover={false}
                />
            ) : (
                <StyledSpinner />
            ),
        [isSearching],
    );
    return (
        <Suggest2
            disabled={disabled}
            fill
            items={Array.from(options).sort()}
            noResults={
                isFetchingInitialData ? (
                    <StyledSpinner />
                ) : (
                    <MenuItem2 disabled text="No suggestions." />
                )
            }
            itemsEqual={(v, other) => v.toLowerCase() === other.toLowerCase()}
            selectedItem={value}
            itemRenderer={renderItem}
            onItemSelect={onChange}
            popoverProps={{
                minimal: true,
                matchTargetWidth: true,
                popoverClassName: 'autocomplete-max-height',
                ...popoverProps,
            }}
            resetOnSelect
            itemPredicate={itemPredicate}
            createNewItemRenderer={renderCreateOption}
            createNewItemFromQuery={(name: string) => name}
            onQueryChange={setSearch}
            inputValueRenderer={(item: string) => {
                return item;
            }}
        />
    );
};

export default AutoComplete;
