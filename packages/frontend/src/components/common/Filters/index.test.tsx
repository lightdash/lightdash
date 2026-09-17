import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FiltersForm from '.';
import { renderWithProviders } from '../../../testing/testUtils';
import FiltersProvider from './FiltersProvider';

describe('FiltersForm', () => {
    it('blends the add-filter section with its card surface', () => {
        renderWithProviders(
            <FiltersProvider itemsMap={{}}>
                <FiltersForm isEditMode filters={{}} setFilters={vi.fn()} />
            </FiltersProvider>,
        );

        const addFilterButton = screen.getByTestId(
            'FiltersForm/add-filter-button',
        );
        const addFilterSection = addFilterButton.parentElement?.parentElement;

        expect(addFilterSection?.style.backgroundColor).toBe(
            'var(--mantine-color-body)',
        );
    });
});
