import { SearchItemType } from '@lightdash/common';
import { fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MantineBaseProvider from '../../../providers/MantineBaseProvider';
import { type OmnibarGroup, type SearchItem } from '../types/searchItem';
import {
    getFocusedItemIndex,
    getOmnibarItemKey,
} from '../utils/getFocusedItemIndex';
import OmnibarItemGroups from './OmnibarItemGroups';
import { OmnibarKeyboardNav } from './OmnibarKeyboardNav';

const orders: SearchItem = {
    type: SearchItemType.TABLE,
    title: 'Orders',
    location: { pathname: '/tables/orders' },
};
const customers: SearchItem = {
    ...orders,
    title: 'Customers',
    location: { pathname: '/tables/customers' },
};
const models: OmnibarGroup = {
    key: 'tables',
    label: 'Tables',
    items: [orders, customers],
    totalCount: 2,
    collapsed: false,
};
const content: OmnibarGroup = {
    key: 'dashboards',
    label: 'Dashboards',
    items: [
        {
            type: SearchItemType.DASHBOARD,
            title: 'Revenue',
            location: { pathname: '/dashboards/revenue' },
        },
    ],
    totalCount: 1,
    collapsed: false,
};
const Results = ({ groups }: { groups: OmnibarGroup[] }) => {
    const [selectedKey, setSelectedKey] = useState(getOmnibarItemKey(orders));
    const scrollRef = useRef<HTMLDivElement>(null);
    const focusedItemIndex = getFocusedItemIndex(groups, selectedKey);
    const select = (index?: { groupIndex: number; itemIndex: number }) => {
        if (index)
            setSelectedKey(
                getOmnibarItemKey(
                    groups[index.groupIndex].items[index.itemIndex],
                ),
            );
    };
    return (
        <MantineBaseProvider env="test">
            <OmnibarKeyboardNav
                groupedItems={groups}
                currentFocusedItemIndex={focusedItemIndex}
                onFocusedItemChange={select}
                onEnterPressed={() => {}}
            >
                <input aria-label="Search" />
                <OmnibarItemGroups
                    projectUuid="project"
                    groups={groups}
                    canUserManageValidation={false}
                    focusedItemIndex={focusedItemIndex}
                    onFocusedItemChange={select}
                    onClick={() => {}}
                    onToggleGroup={() => {}}
                    scrollRef={scrollRef}
                />
            </OmnibarKeyboardNav>
        </MantineBaseProvider>
    );
};

describe('omnibar scrolling', () => {
    afterEach(() => vi.restoreAllMocks());

    it('keeps the viewport still when late results move the selected table into a later group', () => {
        const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
        const { rerender } = render(<Results groups={[models]} />);
        scrollIntoView.mockClear();

        rerender(<Results groups={[content, models]} />);

        expect(
            screen.getByRole('menuitem', { name: 'Orders' }),
        ).toHaveAttribute('data-hovered');
        expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it('still scrolls to the result selected with the arrow keys', () => {
        const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
        render(<Results groups={[models]} />);
        scrollIntoView.mockClear();

        fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowDown' });

        expect(
            screen.getByRole('menuitem', { name: 'Customers' }),
        ).toHaveAttribute('data-hovered');
        expect(scrollIntoView).toHaveBeenCalledOnce();
        expect(scrollIntoView.mock.contexts[0]).toHaveTextContent('Customers');
    });
});
