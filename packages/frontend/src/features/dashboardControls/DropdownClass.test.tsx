import { Popover, Select } from '@mantine/core';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { DropdownClass } from './DropdownClass';

const renderLists = (className: string | null) =>
    renderWithProviders(
        <DropdownClass className={className}>
            <Select
                aria-label="Operator"
                data={['is', 'is not']}
                defaultDropdownOpened
            />
            <Popover opened>
                <Popover.Target>
                    <button type="button">Date</button>
                </Popover.Target>
                <Popover.Dropdown>Calendar</Popover.Dropdown>
            </Popover>
        </DropdownClass>,
    );

describe('DropdownClass', () => {
    it('puts the class on every portalled list inside it', async () => {
        renderLists('ld-dashboard-filter-dropdown');

        const option = await screen.findByRole('option', { name: 'is not' });
        expect(option.closest('.ld-dashboard-filter-dropdown')).not.toBeNull();
        expect(
            screen
                .getByText('Calendar')
                .closest('.ld-dashboard-filter-dropdown'),
        ).not.toBeNull();
    });

    it('adds nothing without a class', async () => {
        const { baseElement } = renderLists(null);

        await screen.findByRole('option', { name: 'is not' });
        expect(
            baseElement.querySelector('.ld-dashboard-filter-dropdown'),
        ).toBeNull();
    });
});
