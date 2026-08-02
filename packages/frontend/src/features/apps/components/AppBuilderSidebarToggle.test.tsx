import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import AppBuilderSidebarToggle from './AppBuilderSidebarToggle';

describe('AppBuilderSidebarToggle', () => {
    it.each([
        [false, 'Hide build panel'],
        [true, 'Show build panel'],
    ])(
        'exposes the correct action when collapsed is %s',
        (collapsed, label) => {
            const onToggle = vi.fn();
            renderWithProviders(
                <AppBuilderSidebarToggle
                    collapsed={collapsed}
                    onToggle={onToggle}
                />,
            );

            fireEvent.click(screen.getByRole('button', { name: label }));

            expect(onToggle).toHaveBeenCalledOnce();
        },
    );
});
