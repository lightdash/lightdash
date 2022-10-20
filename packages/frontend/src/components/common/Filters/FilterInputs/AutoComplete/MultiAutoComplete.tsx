import { Spinner } from '@blueprintjs/core';
import { MenuItem2, Popover2Props } from '@blueprintjs/popover2';
import { ItemRenderer, MultiSelect2 } from '@blueprintjs/select';
import { FilterableField, getItemId } from '@lightdash/common';
import React, { FC, useCallback } from 'react';
import { Hightlighed } from '../../../../NavBar/GlobalSearch/globalSearch.styles';
import HighlightedText from '../../../HighlightedText';
import { useFiltersContext } from '../../FiltersProvider';
import {
    itemPredicate,
    toggleValueFromArray,
    useAutoComplete,
} from './autoCompleteUtils';

type Props = {
    field: FilterableField;
    values: string[];
    suggestions: string[];
    popoverProps?: Popover2Props;
    disabled?: boolean;
    onChange: (values: string[]) => void;
};

const StyledSpinner = () => <Spinner size={16} style={{ margin: 12 }} />;

const MultiAutoComplete: FC<Props> = ({
    values,
    field,
    suggestions,
    popoverProps,
    disabled,
    onChange,
}) => {
    const { projectUuid } = useFiltersContext();
    const { options, setSearch, isSearching, isFetchingInitialData } =
        useAutoComplete(values, suggestions, getItemId(field), projectUuid);

    const renderItem: ItemRenderer<string> = useCallback(
        (name, { modifiers, handleClick, query }) => {
            if (!modifiers.matchesPredicate) {
                return null;
            }
            return (
                <MenuItem2
                    active={modifiers.active}
                    icon={values.includes(name) ? 'tick' : 'blank'}
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
        [values],
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
    const onItemSelect = useCallback(
        (value: string) => {
            onChange(toggleValueFromArray(values, value));
        },
        [onChange, values],
    );
    const onRemove = useCallback(
        (selectedValue: React.ReactNode) => {
            onChange(values.filter((v: string) => v !== selectedValue));
        },
        [onChange, values],
    );
    return (
        <MultiSelect2
            className={disabled ? 'disabled-filter' : ''}
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
            itemsEqual={(value, other) =>
                value.toLowerCase() === other.toLowerCase()
            }
            selectedItems={values}
            itemRenderer={renderItem}
            tagRenderer={(name) => name}
            onItemSelect={onItemSelect}
            tagInputProps={{
                placeholder: undefined,
                tagProps: {
                    minimal: true,
                },
                onRemove,
            }}
            popoverProps={{
                minimal: true,
                ...popoverProps,
            }}
            resetOnSelect
            itemPredicate={itemPredicate}
            createNewItemRenderer={renderCreateOption}
            createNewItemFromQuery={(name: string) => name}
            onQueryChange={setSearch}
        />
    );
};

export default MultiAutoComplete;
