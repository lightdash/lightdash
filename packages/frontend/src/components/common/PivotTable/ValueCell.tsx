import {
    ConditionalFormattingConfig,
    Field,
    getConditionalFormattingConfig,
    getConditionalFormattingDescription,
    ResultValue,
    TableCalculation,
} from '@lightdash/common';
import { Box, Text, Tooltip } from '@mantine/core';
import { mergeRefs, useClipboard, useHotkeys } from '@mantine/hooks';
import {
    FC,
    ForwardedRef,
    forwardRef,
    useCallback,
    useMemo,
    useState,
} from 'react';

import { readableColor } from '../../../utils/colorUtils';
import { getConditionalRuleLabel } from '../Filters/configs';
import { usePivotTableCellStyles } from './tableStyles';
import ValueCellMenu from './ValueCellMenu';

type ValueCellProps = {
    item: Field | TableCalculation;
    value: ResultValue | null;
    rowIndex: number;
    colIndex: number;
    conditionalFormattings: ConditionalFormattingConfig[];
    getUnderlyingFieldValues: (
        colIndex: number,
        rowIndex: number,
    ) => Record<string, ResultValue>;
    getField: (fieldId: string) => Field | TableCalculation;
};

type ForwardRefProps = {
    render: (
        props: React.HTMLAttributes<HTMLTableCellElement>,
        ref: ForwardedRef<HTMLTableCellElement> | null,
    ) => JSX.Element;
};

const ForwardRef = forwardRef<HTMLTableCellElement, ForwardRefProps>(
    ({ render, ...props }, ref) => render(props, ref),
);

const ValueCell: FC<ValueCellProps> = ({
    item,
    value,
    rowIndex,
    colIndex,
    conditionalFormattings,
    getUnderlyingFieldValues,
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

        if (!conditionalFormattingConfig) return undefined;

        return {
            tooltipContent,
            color: readableColor(conditionalFormattingConfig.color),
            backgroundColor: conditionalFormattingConfig.color,
        };
    }, [conditionalFormattings, item, value]);

    const [isMenuOpen, setIsMenuOpen] = useState(false);

    // TODO: optimisation - can be one hook on the parent
    const clipboard = useClipboard({ timeout: 200 });

    const handleCopy = useCallback(() => {
        if (isMenuOpen) {
            clipboard.copy(value?.formatted);
        }
    }, [clipboard, value, isMenuOpen]);

    useHotkeys([['mod+c', handleCopy]]);

    const hasValue = !!value?.formatted;

    const { cx, classes } = usePivotTableCellStyles({
        hasValue,
        conditionalFormatting,
    });

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
            <ForwardRef
                render={(menuProps, menuRef) => (
                    <Tooltip
                        disabled={!conditionalFormatting}
                        label={conditionalFormatting?.tooltipContent}
                        withinPortal
                    >
                        <ForwardRef
                            render={(tooltipProps, tooltipRef) => (
                                <Box
                                    component="td"
                                    ref={mergeRefs(menuRef, tooltipRef)}
                                    {...tooltipProps}
                                    {...menuProps}
                                    data-copied={clipboard.copied}
                                    data-conditional-formatting={
                                        !!conditionalFormatting
                                    }
                                    className={cx(
                                        tooltipProps.className,
                                        menuProps.className,
                                        classes.root,
                                        {
                                            [classes.conditionalFormatting]:
                                                conditionalFormatting,
                                        },
                                    )}
                                >
                                    <Text>{value?.formatted}</Text>
                                </Box>
                            )}
                        />
                    </Tooltip>
                )}
            />
        </ValueCellMenu>
    );
};

export default ValueCell;
