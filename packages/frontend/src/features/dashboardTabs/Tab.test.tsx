import { DragDropContext, Droppable } from '@hello-pangea/dnd';
import { type DashboardTab } from '@lightdash/common';
import { Tabs } from '@mantine/core';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import DraggableTab from './Tab';

const tabs: DashboardTab[] = [0, 1, 2, 3].map((order) => ({
    uuid: `tab-${order}`,
    name: `Tab ${order}`,
    order,
}));

describe('DraggableTab', () => {
    // The filter rail's tab counts lift the cap through the variable
    it("caps a tab's width at its share of the viewport unless a stylesheet sets the variable", () => {
        renderWithProviders(
            <DragDropContext onDragEnd={vi.fn()}>
                <Droppable droppableId="tabs" direction="horizontal">
                    {(provided) => (
                        <div ref={provided.innerRef}>
                            <Tabs value="tab-0">
                                <Tabs.List>
                                    <DraggableTab
                                        idx={0}
                                        tab={tabs[0]}
                                        isEditMode={false}
                                        sortedTabs={tabs}
                                        currentTabHasTiles
                                        setEditingTab={vi.fn()}
                                        setDeletingTab={vi.fn()}
                                        handleDeleteTab={vi.fn()}
                                        handleDuplicateTab={vi.fn()}
                                        handleToggleTabHidden={vi.fn()}
                                    />
                                </Tabs.List>
                            </Tabs>
                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>,
        );

        expect(screen.getByRole('tab', { name: 'Tab 0' }).style.maxWidth).toBe(
            'var(--dashboard-tab-max-width, 25vw)',
        );
    });
});
