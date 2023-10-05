import { MenuItem2 } from '@blueprintjs/popover2';
import { ItemRenderer } from '@blueprintjs/select';
import {
    Field,
    getItemId,
    getItemLabelWithoutTableName,
    isField,
    TableCalculation,
} from '@lightdash/common';
import { Tooltip } from '@mantine/core';
import { forwardRef, MouseEventHandler, ReactNode } from 'react';
import FieldIcon from '../FieldIcon';
import FieldLabel from '../FieldLabel';

const FilterItem = forwardRef<
    HTMLDivElement,
    {
        item: Field | TableCalculation;
        active: boolean;
        disabled: boolean;
        text: ReactNode;
        handleFocus: (() => void) | undefined;
        handleClick: MouseEventHandler<HTMLElement>;
    }
>(({ item, active, disabled, handleClick, handleFocus, text }, ref) => (
    <div ref={ref}>
        <MenuItem2
            key={getItemId(item)}
            roleStructure="listoption"
            shouldDismissPopover={false}
            active={active}
            disabled={disabled}
            icon={<FieldIcon item={item} />}
            onClick={handleClick}
            onFocus={handleFocus}
            text={text}
        />
    </div>
));

const createFilterItemRenderer =
    (
        getText: (item: Field | TableCalculation) => ReactNode,
    ): ItemRenderer<Field | TableCalculation> =>
    (item, { modifiers, handleClick, handleFocus }) => {
        if (!modifiers.matchesPredicate) {
            return null;
        }
        return (
            <Tooltip
                withinPortal
                label={isField(item) ? item.description : ''}
                disabled={
                    !isField(item) || (isField(item) && !item.description)
                }
                multiline
                openDelay={500}
            >
                <FilterItem
                    item={item}
                    active={modifiers.active}
                    disabled={modifiers.disabled}
                    text={getText(item)}
                    handleClick={handleClick}
                    handleFocus={handleFocus}
                />
            </Tooltip>
        );
    };

export const renderFilterItem = createFilterItemRenderer((item) => (
    <FieldLabel item={item} />
));

export const renderFilterItemWithoutTableName = createFilterItemRenderer(
    getItemLabelWithoutTableName,
);
