import { useDisclosure } from '@mantine-8/hooks';
import {
    useCallback,
    useMemo,
    useState,
    type FC,
    type PropsWithChildren,
} from 'react';
import { FilterBarPopoversContext } from './FilterBarPopoversContext';

export const FilterBarPopoversProvider: FC<PropsWithChildren> = ({
    children,
}) => {
    const [
        isRulesPopoverOpen,
        { open: openRulesPopover, close: closeRulesPopover },
    ] = useDisclosure(false);
    const [openFilterPopoverId, setOpenFilterPopoverId] = useState<string>();

    const openFilterPopover = useCallback((popoverId: string) => {
        setOpenFilterPopoverId(popoverId);
    }, []);

    const closeFilterPopover = useCallback(() => {
        setOpenFilterPopoverId(undefined);
    }, []);

    const value = useMemo(
        () => ({
            isRulesPopoverOpen,
            openRulesPopover,
            closeRulesPopover,
            openFilterPopoverId,
            openFilterPopover,
            closeFilterPopover,
        }),
        [
            isRulesPopoverOpen,
            openRulesPopover,
            closeRulesPopover,
            openFilterPopoverId,
            openFilterPopover,
            closeFilterPopover,
        ],
    );

    return (
        <FilterBarPopoversContext.Provider value={value}>
            {children}
        </FilterBarPopoversContext.Provider>
    );
};
