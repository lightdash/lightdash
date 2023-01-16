import { MenuItem2 } from '@blueprintjs/popover2';
import { ItemRenderer } from '@blueprintjs/select';
import {
    AdditionalMetric,
    Field,
    getItemId,
    TableCalculation,
} from '@lightdash/common';
import FieldIcon from './FieldIcon';
import FieldLabel from './FieldLabel';

const renderFilterItem =
    (
        inactiveFieldIds: string[] = [],
    ): ItemRenderer<Field | TableCalculation | AdditionalMetric> =>
    (item, { modifiers, handleClick, handleFocus }) => {
        if (!modifiers.matchesPredicate) {
            return null;
        }
        return (
            <MenuItem2
                key={getItemId(item)}
                roleStructure="listoption"
                shouldDismissPopover={false}
                active={modifiers.active}
                disabled={
                    modifiers.disabled ||
                    inactiveFieldIds.includes(getItemId(item))
                }
                icon={<FieldIcon item={item} />}
                text={<FieldLabel item={item} />}
                onClick={handleClick}
                onFocus={handleFocus}
            />
        );
    };

export default renderFilterItem;
