import { DEFAULT_GROUP_LIMIT_CONFIG } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { GroupLimitConfig } from './GroupLimitConfig';

const defaultProps = {
    setGroupLimit: vi.fn(),
    setGroupLimitEnabled: vi.fn(),
    totalGroups: 10,
};

describe('GroupLimitConfig', () => {
    describe('disabled state', () => {
        it('renders toggle in off state when groupLimit is undefined', () => {
            renderWithProviders(
                <GroupLimitConfig {...defaultProps} groupLimit={undefined} />,
            );

            const toggle = screen.getByRole('switch', {
                name: /limit visible groups/i,
            });
            expect(toggle).not.toBeChecked();
        });

        it('does not render NumberInput when disabled', () => {
            renderWithProviders(
                <GroupLimitConfig
                    {...defaultProps}
                    groupLimit={{ enabled: false, maxGroups: 5 }}
                />,
            );

            expect(
                screen.queryByLabelText(/show top/i),
            ).not.toBeInTheDocument();
        });
    });

    describe('enabled state', () => {
        it('renders NumberInput when enabled', () => {
            renderWithProviders(
                <GroupLimitConfig
                    {...defaultProps}
                    groupLimit={{ enabled: true, maxGroups: 5 }}
                />,
            );

            const input = screen.getByLabelText(/show top/i);
            expect(input).toBeInTheDocument();
            expect(input).toHaveValue('5');
        });

        it('shows feedback text with correct hidden group count', () => {
            renderWithProviders(
                <GroupLimitConfig
                    {...defaultProps}
                    totalGroups={10}
                    groupLimit={{ enabled: true, maxGroups: 3 }}
                />,
            );

            expect(
                screen.getByText(/7 groups will be hidden/i),
            ).toBeInTheDocument();
        });

        it('uses singular "group" when exactly 1 is hidden', () => {
            renderWithProviders(
                <GroupLimitConfig
                    {...defaultProps}
                    totalGroups={4}
                    groupLimit={{ enabled: true, maxGroups: 3 }}
                />,
            );

            expect(
                screen.getByText(/1 group will be hidden/i),
            ).toBeInTheDocument();
        });

        it('does not show feedback text when no groups are hidden', () => {
            renderWithProviders(
                <GroupLimitConfig
                    {...defaultProps}
                    totalGroups={3}
                    groupLimit={{ enabled: true, maxGroups: 5 }}
                />,
            );

            expect(
                screen.queryByText(/will be hidden/i),
            ).not.toBeInTheDocument();
        });
    });

    describe('NumberInput max constraint (M1 regression)', () => {
        it('clamps max to totalGroups - 1', () => {
            renderWithProviders(
                <GroupLimitConfig
                    {...defaultProps}
                    totalGroups={4}
                    groupLimit={{ enabled: true, maxGroups: 3 }}
                />,
            );

            const input = screen.getByLabelText(/show top/i);
            expect(input).toHaveAttribute('max', '3');
        });

        it('sets max to 1 when totalGroups is 2', () => {
            renderWithProviders(
                <GroupLimitConfig
                    {...defaultProps}
                    totalGroups={2}
                    groupLimit={{ enabled: true, maxGroups: 1 }}
                />,
            );

            const input = screen.getByLabelText(/show top/i);
            expect(input).toHaveAttribute('max', '1');
        });

        it('sets max to at least 1 even when totalGroups is 0', () => {
            renderWithProviders(
                <GroupLimitConfig
                    {...defaultProps}
                    totalGroups={0}
                    groupLimit={{ enabled: true, maxGroups: 1 }}
                />,
            );

            const input = screen.getByLabelText(/show top/i);
            expect(input).toHaveAttribute('max', '1');
        });

        it('displays default maxGroups when groupLimit is enabled but maxGroups not set', () => {
            renderWithProviders(
                <GroupLimitConfig
                    {...defaultProps}
                    totalGroups={10}
                    groupLimit={{ enabled: true } as any}
                />,
            );

            const input = screen.getByLabelText(/show top/i);
            expect(input).toHaveValue(
                String(DEFAULT_GROUP_LIMIT_CONFIG.maxGroups),
            );
        });
    });

    describe('callbacks', () => {
        it('calls setGroupLimitEnabled when toggle is clicked', async () => {
            const setGroupLimitEnabled = vi.fn();
            renderWithProviders(
                <GroupLimitConfig
                    {...defaultProps}
                    setGroupLimitEnabled={setGroupLimitEnabled}
                    groupLimit={undefined}
                />,
            );

            const toggle = screen.getByRole('switch', {
                name: /limit visible groups/i,
            });
            await userEvent.click(toggle);
            expect(setGroupLimitEnabled).toHaveBeenCalledWith(true);
        });

        it('calls setGroupLimit with new value when NumberInput changes', async () => {
            const setGroupLimit = vi.fn();
            renderWithProviders(
                <GroupLimitConfig
                    {...defaultProps}
                    setGroupLimit={setGroupLimit}
                    totalGroups={10}
                    groupLimit={{ enabled: true, maxGroups: 5 }}
                />,
            );

            const input = screen.getByLabelText(/show top/i);
            await userEvent.clear(input);
            await userEvent.type(input, '3');

            expect(setGroupLimit).toHaveBeenCalledWith(
                expect.objectContaining({
                    enabled: true,
                    maxGroups: 3,
                }),
            );
        });
    });
});
