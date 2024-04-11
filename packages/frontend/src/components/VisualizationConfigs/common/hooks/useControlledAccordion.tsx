import { useCallback, useState } from 'react';

export const useControlledAccordion = (defaultOpenItems = []) => {
    const [openItems, setOpenItems] = useState<string[]>(defaultOpenItems);

    const handleAccordionChange = useCallback((itemValues: string[]) => {
        setOpenItems(itemValues);
    }, []);

    const addNewItem = useCallback((index: string) => {
        setOpenItems((prevOpenItems) => [...prevOpenItems, index]);
    }, []);

    const removeItem = useCallback((index: string) => {
        setOpenItems((prevOpenItems) =>
            prevOpenItems.filter((item) => item !== index),
        );
    }, []);

    return { openItems, handleAccordionChange, addNewItem, removeItem };
};
