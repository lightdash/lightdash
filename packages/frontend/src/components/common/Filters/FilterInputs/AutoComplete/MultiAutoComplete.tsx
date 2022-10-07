import { Spinner } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import { ItemRenderer, MultiSelect2 } from '@blueprintjs/select';
import { FilterableField, getItemId } from '@lightdash/common';
import React, { FC, useCallback, useState } from 'react';
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
    onChange: (values: string[]) => void;
};

const MultiAutoComplete: FC<Props> = ({
    values,
    field,
    suggestions,
    onChange,
}) => {
    const { projectUuid } = useFiltersContext();
    const { options, setSearch, isSearching } = useAutoComplete(
        values,
        suggestions,
        getItemId(field),
        projectUuid,
    );

    const [isOpen, setIsOpen] = useState(false);

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
                <Spinner size={16} style={{ margin: 12 }} />
            ),
        [isSearching],
    );
    const onItemSelect = useCallback(
        (value: string) => {
            onChange(toggleValueFromArray(values, value));
            setIsOpen(false);
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
            fill
            items={Array.from(options).sort()}
            noResults={<MenuItem2 disabled text="No suggestions." />}
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
                captureDismiss: true,
                minimal: true,
                matchTargetWidth: true,
                isOpen,
                onInteraction: setIsOpen,
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
