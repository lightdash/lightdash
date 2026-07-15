import { useDisclosure } from '@mantine-8/hooks';
import { useMemo, type FC, type PropsWithChildren } from 'react';
import { FilterBarPopoversContext } from './FilterBarPopoversContext';

export const FilterBarPopoversProvider: FC<PropsWithChildren> = ({
    children,
}) => {
    const [
        isRulesPopoverOpen,
        { open: openRulesPopover, close: closeRulesPopover },
    ] = useDisclosure(false);

    const value = useMemo(
        () => ({
            isRulesPopoverOpen,
            openRulesPopover,
            closeRulesPopover,
        }),
        [isRulesPopoverOpen, openRulesPopover, closeRulesPopover],
    );

    return (
        <FilterBarPopoversContext.Provider value={value}>
            {children}
        </FilterBarPopoversContext.Provider>
    );
};
