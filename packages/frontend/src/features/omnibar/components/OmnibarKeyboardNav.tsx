import { Box } from '@mantine-8/core';
import { useCallback, type PropsWithChildren } from 'react';
import {
    type FocusedItemIndex,
    type OmnibarGroup,
    type SearchItem,
} from '../types/searchItem';

interface Props {
    groupedItems: OmnibarGroup[];
    onEnterPressed: (item: SearchItem) => void;
    onFocusedItemChange: (index?: FocusedItemIndex) => void;
    currentFocusedItemIndex?: FocusedItemIndex;
    /** Opened on Enter while no row is highlighted (the "top hit"). */
    fallbackEnterItem?: SearchItem;
}

export const OmnibarKeyboardNav = ({
    children,
    groupedItems,
    currentFocusedItemIndex,
    onEnterPressed,
    onFocusedItemChange,
    fallbackEnterItem,
}: PropsWithChildren<Props>) => {
    // Collapsed groups keep empty item arrays — skip them in both directions.
    const findNextNavigableGroup = useCallback(
        (fromGroupIndex: number, direction: 1 | -1) => {
            for (
                let i = fromGroupIndex + direction;
                i >= 0 && i < groupedItems.length;
                i += direction
            ) {
                if (groupedItems[i].items.length > 0) return i;
            }
            return -1;
        },
        [groupedItems],
    );

    const handleArrowDown = useCallback((): FocusedItemIndex | undefined => {
        if (!currentFocusedItemIndex) {
            const firstGroup = findNextNavigableGroup(-1, 1);
            return firstGroup === -1
                ? undefined
                : { groupIndex: firstGroup, itemIndex: 0 };
        }

        const groupItems =
            groupedItems[currentFocusedItemIndex.groupIndex]?.items ?? [];
        if (currentFocusedItemIndex.itemIndex < groupItems.length - 1) {
            // move to next item in the same group
            return {
                groupIndex: currentFocusedItemIndex.groupIndex,
                itemIndex: currentFocusedItemIndex.itemIndex + 1,
            };
        }

        const nextGroup = findNextNavigableGroup(
            currentFocusedItemIndex.groupIndex,
            1,
        );
        if (nextGroup !== -1) {
            // move to the first item in the next navigable group
            return { groupIndex: nextGroup, itemIndex: 0 };
        }

        // stay on the last item — no wrap-around
        return currentFocusedItemIndex;
    }, [currentFocusedItemIndex, groupedItems, findNextNavigableGroup]);

    const handleArrowUp = useCallback((): FocusedItemIndex | undefined => {
        if (!currentFocusedItemIndex) {
            return undefined;
        }

        if (currentFocusedItemIndex.itemIndex > 0) {
            // move to previous item in the same group
            return {
                groupIndex: currentFocusedItemIndex.groupIndex,
                itemIndex: currentFocusedItemIndex.itemIndex - 1,
            };
        }

        const prevGroup = findNextNavigableGroup(
            currentFocusedItemIndex.groupIndex,
            -1,
        );
        if (prevGroup !== -1) {
            // move to the last item in the previous navigable group
            return {
                groupIndex: prevGroup,
                itemIndex: groupedItems[prevGroup].items.length - 1,
            };
        }

        // at the very top — hand the highlight back to the search input
        return undefined;
    }, [currentFocusedItemIndex, groupedItems, findNextNavigableGroup]);

    const onKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (groupedItems.length < 1) {
                return;
            }

            switch (event.key) {
                case 'ArrowDown':
                    event.preventDefault();

                    onFocusedItemChange(handleArrowDown());

                    break;
                case 'ArrowUp':
                    event.preventDefault();

                    onFocusedItemChange(handleArrowUp());

                    break;
                case 'Enter': {
                    event.preventDefault();

                    const item = currentFocusedItemIndex
                        ? groupedItems[currentFocusedItemIndex.groupIndex]
                              .items[currentFocusedItemIndex.itemIndex]
                        : fallbackEnterItem;
                    if (item) {
                        onEnterPressed(item);
                    }

                    break;
                }
            }
        },
        [
            currentFocusedItemIndex,
            groupedItems,
            handleArrowDown,
            handleArrowUp,
            onEnterPressed,
            onFocusedItemChange,
            fallbackEnterItem,
        ],
    );

    return (
        <Box display="contents" onKeyDown={onKeyDown}>
            {children}
        </Box>
    );
};
