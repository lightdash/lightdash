import { useDisclosure } from '@mantine-8/hooks';
import { useMemo, type FC, type PropsWithChildren } from 'react';
import { FilterRulesPopoverContext } from './FilterRulesPopoverContext';

export const FilterRulesPopoverProvider: FC<PropsWithChildren> = ({
    children,
}) => {
    const [isOpen, { open, close }] = useDisclosure(false);
    const value = useMemo(
        () => ({ isOpen, open, close }),
        [isOpen, open, close],
    );

    return (
        <FilterRulesPopoverContext.Provider value={value}>
            {children}
        </FilterRulesPopoverContext.Provider>
    );
};
