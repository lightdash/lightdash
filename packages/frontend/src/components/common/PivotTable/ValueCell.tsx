import {
    ConditionalFormattingConfig,
    Field,
    getConditionalFormattingConfig,
    getConditionalFormattingDescription,
    isNumericItem,
    ResultValue,
    TableCalculation,
} from '@lightdash/common';
import { useClipboard, useHotkeys } from '@mantine/hooks';
import { FC, useCallback, useMemo, useState } from 'react';

import { isHexCodeColor, readableColor } from '../../../utils/colorUtils';
import { getConditionalRuleLabel } from '../Filters/configs';
import Cell, { CellProps } from './Cell';
import { usePivotTableCellStyles } from './tableStyles';
import ValueCellMenu from './ValueCellMenu';

interface ValueCellProps extends CellProps {
    item?: Field | TableCalculation;
    value?: ResultValue | null;
    rowIndex?: number;
    colIndex?: number;
    conditionalFormattings?: ConditionalFormattingConfig[];
    getUnderlyingFieldValues?: (
        colIndex: number,
        rowIndex: number,
    ) => Record<string, ResultValue>;
}

const SMALL_TEXT_LENGTH = 30;

const ValueCell: FC<ValueCellProps> = ({
    item,
    value,
    rowIndex,
    colIndex,
    conditionalFormattings,
    getUnderlyingFieldValues,

    ...rest
}) => {
    const conditionalFormatting = useMemo(() => {
        const conditionalFormattingConfig = getConditionalFormattingConfig(
            item,
            value?.raw,
            conditionalFormattings,
        );

        const tooltipContent = getConditionalFormattingDescription(
            item,
            conditionalFormattingConfig,
            getConditionalRuleLabel,
        );

        if (
            !conditionalFormattingConfig ||
            !isHexCodeColor(conditionalFormattingConfig.color)
        )
            return undefined;

        return {
            tooltipContent,
            color: readableColor(conditionalFormattingConfig.color),
            backgroundColor: conditionalFormattingConfig.color,
        };
    }, [conditionalFormattings, item, value]);

    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const clipboard = useClipboard({ timeout: 200 });

    const handleCopy = useCallback(() => {
        if (isMenuOpen) {
            clipboard.copy(value?.formatted);
        }
    }, [clipboard, value, isMenuOpen]);

    useHotkeys([['mod+c', handleCopy]]);

    const { cx, classes } = usePivotTableCellStyles({
        conditionalFormatting,
    });

    const formattedValue = value?.formatted;

    return (
        <ValueCellMenu
            rowIndex={rowIndex}
            colIndex={colIndex}
            opened={isMenuOpen}
            item={item}
            value={value}
            getUnderlyingFieldValues={getUnderlyingFieldValues}
            onCopy={handleCopy}
            onOpen={() => setIsMenuOpen(true)}
            onClose={() => setIsMenuOpen(false)}
        >
            <Cell
                withValue={!!formattedValue}
                withNumericValue={isNumericItem(item)}
                className={cx(
                    {
                        [classes.conditionalFormatting]: conditionalFormatting,
                        [classes.withLargeText]:
                            formattedValue &&
                            formattedValue?.length > SMALL_TEXT_LENGTH,
                    },
                    rest.className,
                )}
                data-conditional-formatting={!!conditionalFormatting}
                data-copied={clipboard.copied}
                tooltipContent={conditionalFormatting?.tooltipContent}
                {...rest}
            >
                {formattedValue}
            </Cell>
        </ValueCellMenu>
    );
};

export default ValueCell;
