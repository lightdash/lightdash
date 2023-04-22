import {
    ConditionalFormattingConfig,
    Field,
    ResultValue,
    TableCalculation,
} from '@lightdash/common';
import { Box, Text } from '@mantine/core';
import { useClipboard, useHotkeys } from '@mantine/hooks';
import { FC, ForwardedRef, forwardRef, useCallback, useState } from 'react';
import { usePivotTableCellStyles } from './tableStyles';
import ValueCellMenu from './ValueCellMenu';

type TotalCellProps = {
    value: ResultValue | null;
};

// TODO: duplicate
type ForwardRefProps = {
    render: (
        props: React.HTMLAttributes<HTMLTableCellElement>,
        ref: ForwardedRef<HTMLTableCellElement> | null,
    ) => JSX.Element;
};
const ForwardRef = forwardRef<HTMLTableCellElement, ForwardRefProps>(
    ({ render, ...props }, ref) => render(props, ref),
);
// end duplicate

const TotalCell: FC<TotalCellProps> = ({ value }) => {
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

    const { cx, classes } = usePivotTableCellStyles({ hasValue });

    return (
        <ValueCellMenu
            opened={isMenuOpen}
            value={value}
            onCopy={handleCopy}
            onOpen={() => setIsMenuOpen(true)}
            onClose={() => setIsMenuOpen(false)}
        >
            <ForwardRef
                render={(menuProps, menuRef) => (
                    <Box
                        component="td"
                        ref={menuRef}
                        {...menuProps}
                        data-copied={clipboard.copied}
                        className={cx(menuProps.className, classes.root)}
                    >
                        <Text>{value?.formatted}</Text>
                    </Box>
                )}
            />
        </ValueCellMenu>
    );
};

export default TotalCell;
