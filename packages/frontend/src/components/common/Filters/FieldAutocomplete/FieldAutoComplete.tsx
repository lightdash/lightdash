import { MenuItem2, Popover2Props } from '@blueprintjs/popover2';
import { Suggest2 } from '@blueprintjs/select';
import {
    Field,
    getItemId,
    getItemLabel,
    TableCalculation,
} from '@lightdash/common';
import { useMemo } from 'react';
import { createGlobalStyle } from 'styled-components';
import { useActiveProjectUuid } from '../../../../hooks/useActiveProject';
import { useExplores } from '../../../../hooks/useExplores';
import FieldIcon from '../FieldIcon';
import {
    renderFilterItem,
    renderFilterItemWithoutTableName,
} from './renderFilterItem';
import RenderFilterList from './renderFilterList';

const AutocompleteMaxHeight = createGlobalStyle`
  .autocomplete-max-height {
    max-height: 400px;
    overflow-y: auto;
  }
`;

type FieldAutoCompleteProps<T> = {
    id?: string;
    name?: string;
    disabled?: boolean;
    autoFocus?: boolean;
    activeField?: T;
    inactiveFieldIds?: string[];
    placeholder?: string;
    fields: Array<T>;
    onChange: (value: T) => void;
    onClosed?: () => void;
    popoverProps?: Popover2Props;
    inputProps?: React.ComponentProps<typeof Suggest2>['inputProps'];
    hasGrouping?: boolean;
};

const FieldAutoComplete = <T extends Field | TableCalculation>({
    disabled,
    autoFocus,
    activeField,
    fields,
    id,
    name,
    onChange,
    onClosed,
    placeholder,
    popoverProps,
    inputProps,
    hasGrouping = false,
}: FieldAutoCompleteProps<T>) => {
    const { activeProjectUuid } = useActiveProjectUuid({
        refetchOnMount: false,
    });
    const { data: exploresData } = useExplores(activeProjectUuid ?? '', false, {
        refetchOnMount: false,
    });

    const sortedFields = useMemo(() => {
        return fields.sort((a, b) =>
            getItemLabel(a).localeCompare(getItemLabel(b)),
        );
    }, [fields]);

    return (hasGrouping && exploresData) || !hasGrouping ? (
        <>
            <AutocompleteMaxHeight />
            <Suggest2<T>
                fill
                className={disabled ? 'disabled-filter' : ''}
                disabled={disabled}
                inputProps={{
                    id,
                    name,
                    autoFocus,
                    placeholder: placeholder || 'Search field...',
                    leftElement: activeField && (
                        <FieldIcon
                            item={activeField}
                            size={16}
                            style={{ margin: '7px 8px' }}
                        />
                    ),
                    ...inputProps,
                }}
                items={sortedFields}
                itemsEqual={(value, other) => {
                    return getItemId(value) === getItemId(other);
                }}
                inputValueRenderer={(item) => {
                    if (!activeField) {
                        return '';
                    }
                    return getItemLabel(item);
                }}
                popoverProps={{
                    minimal: true,
                    onClosed,
                    popoverClassName: 'autocomplete-max-height',
                    captureDismiss: true,
                    ...popoverProps,
                }}
                itemRenderer={
                    hasGrouping
                        ? renderFilterItemWithoutTableName
                        : renderFilterItem
                }
                {...(hasGrouping && {
                    itemListRenderer: (itemListRendererProps) => {
                        const tables =
                            exploresData?.map((explore) => ({
                                description: explore.description,
                                name: explore.name,
                            })) ?? [];
                        return (
                            <RenderFilterList
                                {...itemListRendererProps}
                                tables={tables}
                            />
                        );
                    },
                })}
                activeItem={activeField}
                selectedItem={activeField}
                noResults={<MenuItem2 disabled text="No results." />}
                onItemSelect={onChange}
                itemPredicate={(query, item, _index, exactMatch) => {
                    const label = getItemLabel(item);
                    if (exactMatch) {
                        return query.toLowerCase() === label.toLowerCase();
                    }
                    return label.toLowerCase().includes(query.toLowerCase());
                }}
            />
        </>
    ) : null;
};

export default FieldAutoComplete;
