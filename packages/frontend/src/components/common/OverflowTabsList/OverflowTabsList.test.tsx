import { Tabs } from '@mantine/core';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import OverflowTabsList from './OverflowTabsList';

const renderList = () =>
    renderWithProviders(
        <Tabs defaultValue="display">
            <OverflowTabsList>
                <Tabs.Tab value="display">Display</Tabs.Tab>
                <Tabs.Tab value="style">Style</Tabs.Tab>
                <Tabs.Tab value="labels">Labels</Tabs.Tab>
                <Tabs.Tab value="data">Data</Tabs.Tab>
            </OverflowTabsList>
        </Tabs>,
    );

/** jsdom has no layout, so the scroll geometry is stated outright. */
const setGeometry = (
    list: HTMLElement,
    geometry: { scrollWidth: number; clientWidth: number; scrollLeft: number },
) => {
    Object.entries(geometry).forEach(([property, value]) =>
        Object.defineProperty(list, property, { value, configurable: true }),
    );
    fireEvent.scroll(list);
};

const trailingChevron = (container: HTMLElement) =>
    container.querySelector('.tabler-icon-chevron-right');

describe('OverflowTabsList', () => {
    it('leaves the strip bare when every tab fits', () => {
        const { container } = renderList();

        setGeometry(screen.getByRole('tablist'), {
            scrollWidth: 240,
            clientWidth: 240,
            scrollLeft: 0,
        });

        expect(trailingChevron(container)).toBeNull();
    });

    it('points at the tabs still hidden to the right', () => {
        const { container } = renderList();

        setGeometry(screen.getByRole('tablist'), {
            scrollWidth: 480,
            clientWidth: 240,
            scrollLeft: 0,
        });

        expect(trailingChevron(container)).toBeInTheDocument();
    });

    it('scrolls the strip when its arrow is clicked', () => {
        renderList();
        const list = screen.getByRole('tablist');
        const scrollBy = vi.fn();
        list.scrollBy = scrollBy;

        setGeometry(list, {
            scrollWidth: 480,
            clientWidth: 240,
            scrollLeft: 0,
        });
        fireEvent.click(
            screen.getByRole('button', { name: 'Scroll tabs right' }),
        );

        expect(scrollBy).toHaveBeenCalledWith({
            left: 192,
            behavior: 'smooth',
        });
    });

    it('drops the chevron once the strip is scrolled to the end', () => {
        const { container } = renderList();
        const list = screen.getByRole('tablist');

        setGeometry(list, {
            scrollWidth: 480,
            clientWidth: 240,
            scrollLeft: 0,
        });
        expect(trailingChevron(container)).toBeInTheDocument();

        setGeometry(list, {
            scrollWidth: 480,
            clientWidth: 240,
            scrollLeft: 240,
        });
        expect(trailingChevron(container)).toBeNull();
    });

    it('scrolls only the strip to the active tab, never its ancestors', () => {
        const ancestorScroll = vi.spyOn(
            HTMLElement.prototype,
            'scrollIntoView',
        );
        renderWithProviders(
            <Tabs defaultValue="data">
                <OverflowTabsList>
                    <Tabs.Tab value="display">Display</Tabs.Tab>
                    <Tabs.Tab value="data">Data</Tabs.Tab>
                </OverflowTabsList>
            </Tabs>,
        );

        expect(ancestorScroll).not.toHaveBeenCalled();
        ancestorScroll.mockRestore();
    });
});
