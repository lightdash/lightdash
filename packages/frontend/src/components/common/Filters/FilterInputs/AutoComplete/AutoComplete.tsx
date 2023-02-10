import { Spinner } from '@blueprintjs/core';
import { MenuItem2, Popover2Props } from '@blueprintjs/popover2';
import { ItemRenderer, Suggest2 } from '@blueprintjs/select';
import { FilterableField } from '@lightdash/common';
import { FC, useCallback, useState } from 'react';
import { useFieldValues } from '../../../../../hooks/useFieldValues';
import { Hightlighed } from '../../../../NavBar/GlobalSearch/globalSearch.styles';
import HighlightedText from '../../../HighlightedText';
import { useFiltersContext } from '../../FiltersProvider';
import { itemPredicate } from './autoCompleteUtils';

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
    if (!projectUuid) {
        throw new Error('projectUuid is required in FiltersProvider');
    }

    const [search, setSearch] = useState('');

    const { results, isLoading } = useFieldValues(
        search,
        suggestions,
        projectUuid,
        field,
    );

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

    return (
        <Suggest2
            className={disabled ? 'disabled-filter' : ''}
            disabled={disabled}
            fill
            items={results}
            itemsEqual={(a, b) => a.toLowerCase() === b.toLowerCase()}
            selectedItem={value}
            itemRenderer={renderItem}
            inputProps={{
                rightElement: isLoading ? (
                    <Spinner style={{ margin: 6 }} size={16} />
                ) : undefined,
            }}
            onItemSelect={onChange}
            popoverProps={{
                minimal: true,
                matchTargetWidth: true,
                popoverClassName: 'autocomplete-max-height',
                ...popoverProps,
            }}
            resetOnSelect
            itemPredicate={itemPredicate}
            createNewItemRenderer={(query, active, handleClick) => (
                <MenuItem2
                    icon="add"
                    text={`Add "${query}"`}
                    active={active}
                    onClick={handleClick}
                    shouldDismissPopover={false}
                />
            )}
            createNewItemFromQuery={(name: string) => name}
            onQueryChange={setSearch}
            inputValueRenderer={(item: string) => {
                return item;
            }}
        />
    );
};

export default AutoComplete;
