import { MenuItem2 } from '@blueprintjs/popover2';
import { ItemRenderer } from '@blueprintjs/select';
import {
    Field,
    getItemId,
    getItemLabelWithoutTableName,
    TableCalculation,
} from '@lightdash/common';
import FieldIcon from './FieldIcon';
import FieldLabel from './FieldLabel';

export const renderFilterItem: ItemRenderer<Field | TableCalculation> = (
    item,
    { modifiers, handleClick, handleFocus },
) => {
    if (!modifiers.matchesPredicate) {
        return null;
    }
    return (
        <MenuItem2
            key={getItemId(item)}
            roleStructure="listoption"
            shouldDismissPopover={false}
            active={modifiers.active}
            disabled={modifiers.disabled}
            icon={<FieldIcon item={item} />}
            text={<FieldLabel item={item} />}
            onClick={handleClick}
            onFocus={handleFocus}
        />
    );
};

export const renderFilterItemWithoutTableName: ItemRenderer<
    Field | TableCalculation
> = (item, { modifiers, handleClick, handleFocus }) => {
    if (!modifiers.matchesPredicate) {
        return null;
    }
    return (
        <MenuItem2
            key={getItemId(item)}
            roleStructure="listoption"
            shouldDismissPopover={false}
            active={modifiers.active}
            disabled={modifiers.disabled}
            icon={<FieldIcon item={item} />}
            text={getItemLabelWithoutTableName(item)}
            onClick={handleClick}
            onFocus={handleFocus}
        />
    );
};
