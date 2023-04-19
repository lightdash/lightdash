import {
    ConditionalFormattingConfig,
    Field,
    getConditionalFormattingConfig,
    getConditionalFormattingDescription,
    PivotValue,
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
import { UnderlyingValueMap } from '../../MetricQueryData/MetricQueryDataProvider';
import { getConditionalRuleLabel } from '../Filters/configs';
import { usePivotTableCellStyles } from './tableStyles';
import ValueCellMenu from './ValueCellMenu';

type ValueCellProps = {
    rowIndex: number;
    colIndex: number;
    getUnderlyingFieldValues: (
        colIndex: number,
        rowIndex: number,
    ) => UnderlyingValueMap;
    value: PivotValue | null;
    conditionalFormattings: ConditionalFormattingConfig[];
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
    rowIndex,
    colIndex,
    value,
    conditionalFormattings,
    getUnderlyingFieldValues,
    getField,
}) => {
    const field = useMemo(
        () => (value?.fieldId ? getField(value.fieldId) : undefined),
        [value, getField],
    );

    const conditionalFormatting = useMemo(() => {
        const conditionalFormattingConfig = getConditionalFormattingConfig(
            field,
            value?.value?.raw,
            conditionalFormattings,
        );

        const tooltipContent = getConditionalFormattingDescription(
            field,
            conditionalFormattingConfig,
            getConditionalRuleLabel,
        );

        if (!conditionalFormattingConfig) return undefined;

        return {
            tooltipContent,
            color: readableColor(conditionalFormattingConfig.color),
            backgroundColor: conditionalFormattingConfig.color,
        };
    }, [conditionalFormattings, field, value]);

    const [isMenuOpen, setIsMenuOpen] = useState(false);

    // TODO: optimisation - can be one hook on the parent
    const clipboard = useClipboard({ timeout: 200 });

    const handleCopy = useCallback(() => {
        if (isMenuOpen) {
            clipboard.copy(value?.value?.formatted);
        }
    }, [clipboard, value, isMenuOpen]);

    useHotkeys([['mod+c', handleCopy]]);

    const hasValue = !!value?.value?.formatted;

    const { cx, classes } = usePivotTableCellStyles({
        hasValue,
        conditionalFormatting,
    });

    return (
        <ValueCellMenu
            rowIndex={rowIndex}
            colIndex={colIndex}
            opened={isMenuOpen}
            item={field}
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
                        withArrow
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
                                    <Text>{value?.value?.formatted}</Text>
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
