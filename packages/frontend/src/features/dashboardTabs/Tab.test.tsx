import { type DashboardTab } from '@lightdash/common';
import { Tabs } from '@mantine/core';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SortableList } from '../../components/common/Sortable/Sortable';
import { renderWithProviders } from '../../testing/testUtils';
import DraggableTab from './Tab';

const tabs: DashboardTab[] = [0, 1, 2, 3].map((order) => ({
    uuid: `tab-${order}`,
    name: `Tab ${order}`,
    order,
}));

type RenderOptions = { isEditMode: boolean; hasQuietActions?: boolean };

const renderTab = ({ isEditMode, hasQuietActions }: RenderOptions) =>
    renderWithProviders(
        <SortableList
            axis="horizontal"
            items={tabs.map((tab) => tab.uuid)}
            onReorder={vi.fn()}
        >
            <Tabs value="tab-0">
                <Tabs.List>
                    <DraggableTab
                        idx={0}
                        tab={tabs[0]}
                        isEditMode={isEditMode}
                        sortedTabs={tabs}
                        currentTabHasTiles
                        setEditingTab={vi.fn()}
                        setDeletingTab={vi.fn()}
                        handleDeleteTab={vi.fn()}
                        handleDuplicateTab={vi.fn()}
                        handleToggleTabHidden={vi.fn()}
                        hasQuietActions={hasQuietActions}
                    />
                </Tabs.List>
            </Tabs>
        </SortableList>,
    );

// jsdom has no layout, but a drag still lifts: the sensors read event coordinates
const mouseDrag = (element: Element) => {
    fireEvent.mouseDown(element, { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(document, { clientX: 20, clientY: 0 });
};

const isDragging = () =>
    screen.getByRole('tab').closest('[data-dragging]') !== null;

describe('DraggableTab', () => {
    // The filter rail's tab counts lift the cap through the variable
    it("caps a tab's width at its share of the viewport unless a stylesheet sets the variable", () => {
        renderTab({ isEditMode: false });

        expect(screen.getByRole('tab', { name: 'Tab 0' }).style.maxWidth).toBe(
            'var(--dashboard-tab-max-width, 25vw)',
        );
    });

    it('keeps the grip and menu always shown by default', () => {
        renderTab({ isEditMode: true });

        expect(
            screen.getByRole('tab').closest('[data-quiet-actions]'),
        ).toBeNull();
    });

    it('marks the grip and menu as shown on hover only when quiet', () => {
        renderTab({ isEditMode: true, hasQuietActions: true });

        // On the drag wrapper, the tab's first focus stop, so focus there reveals them
        const wrapper = screen.getByRole('tab').closest('[data-quiet-actions]');
        expect(wrapper).not.toBeNull();
        expect(wrapper).not.toHaveAttribute('role', 'tab');
        expect(wrapper).toHaveAttribute('tabindex', '0');
    });

    it('renders no grip when quiet: the whole tab is the handle', () => {
        renderTab({ isEditMode: true, hasQuietActions: true });

        const tab = screen.getByRole('tab');
        expect(tab.querySelector("[data-position='left']")).toBeNull();
        expect(
            tab.querySelector("[data-position='right'] [aria-haspopup='menu']"),
        ).not.toBeNull();
    });

    // The tab is a button, yet pressing on it drags
    it('starts a drag from anywhere on a quiet tab', () => {
        renderTab({ isEditMode: true, hasQuietActions: true });

        mouseDrag(screen.getByRole('tab'));
        expect(isDragging()).toBe(true);

        fireEvent.mouseUp(document);
        expect(isDragging()).toBe(false);
    });

    it('lifts a quiet tab from the keyboard on its wrapper', async () => {
        renderTab({ isEditMode: true, hasQuietActions: true });

        const wrapper = screen.getByRole('tab').closest('[data-quiet-actions]');
        fireEvent.keyDown(wrapper!, { code: 'Space' });
        expect(isDragging()).toBe(true);

        await userEvent.keyboard('{Escape}');
        expect(isDragging()).toBe(false);
    });

    it('never lifts a quiet tab on space or enter inside it', async () => {
        renderTab({ isEditMode: true, hasQuietActions: true });

        const tab = screen.getByRole('tab');
        await userEvent.click(tab.querySelector("[aria-haspopup='menu']")!);
        const rename = await screen.findByRole('menuitem', {
            name: 'Rename Tab',
        });
        fireEvent.keyDown(rename, { code: 'Space' });
        fireEvent.keyDown(rename, { code: 'Enter' });
        fireEvent.keyDown(tab, { code: 'Space' });
        fireEvent.keyDown(tab, { code: 'Enter' });
        expect(isDragging()).toBe(false);
    });

    it('never lets a quiet tab start a drag outside edit mode', () => {
        renderTab({ isEditMode: false, hasQuietActions: true });

        mouseDrag(screen.getByRole('tab'));
        expect(isDragging()).toBe(false);
    });

    it('flag-off guard: drags only from the shipped grip', () => {
        renderTab({ isEditMode: true });

        mouseDrag(screen.getByRole('tab'));
        expect(isDragging()).toBe(false);

        mouseDrag(
            screen.getByRole('tab').querySelector("[data-position='left'] *")!,
        );
        expect(isDragging()).toBe(true);

        fireEvent.mouseUp(document);
        expect(isDragging()).toBe(false);
    });

    it('flag-off guard: keeps the shipped grip without the prop', () => {
        renderTab({ isEditMode: true });

        expect(
            screen.getByRole('tab').querySelector("[data-position='left']"),
        ).not.toBeNull();
    });

    it('marks nothing outside edit mode, where there is no grip or menu', () => {
        renderTab({ isEditMode: false, hasQuietActions: true });

        expect(
            screen.getByRole('tab').closest('[data-quiet-actions]'),
        ).toBeNull();
    });

    describe('a long name in edit mode', () => {
        afterEach(() => vi.restoreAllMocks());

        // jsdom lays nothing out: only the label reads as cut
        const truncateLabel = () => {
            const isLabel = (element: HTMLElement) =>
                element.classList.contains('mantine-Tabs-tabLabel');
            vi.spyOn(
                HTMLElement.prototype,
                'scrollWidth',
                'get',
            ).mockImplementation(function (this: HTMLElement) {
                return isLabel(this) ? 200 : 0;
            });
            vi.spyOn(
                HTMLElement.prototype,
                'clientWidth',
                'get',
            ).mockImplementation(function (this: HTMLElement) {
                return isLabel(this) ? 100 : 0;
            });
        };

        it('names the cut tab in a tooltip when quiet, past the grip', async () => {
            truncateLabel();
            renderTab({ isEditMode: true, hasQuietActions: true });

            await userEvent.hover(screen.getByRole('tab'));
            expect(await screen.findByRole('tooltip')).toHaveTextContent(
                'Tab 0',
            );
        });
    });
});
