import { TimeFrames } from '@lightdash/common';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { CanvasConnectionModal } from './CanvasConnectionModal';
import { CanvasViewport } from './CanvasViewport';

const nodes = [
    {
        id: 'revenue',
        position: { x: 0, y: 0 },
        data: {
            label: 'Revenue',
            tableName: 'orders',
            metricName: 'revenue',
            timeFrame: TimeFrames.MONTH,
        },
    },
    {
        id: 'users',
        position: { x: 0, y: 100 },
        data: {
            label: 'Users',
            tableName: 'users',
            metricName: 'count',
            timeFrame: TimeFrames.MONTH,
        },
    },
];

describe('canvas connections', () => {
    it('supports keyboard selection and submission inside an expanded canvas', async () => {
        const user = userEvent.setup();
        const onConnect = vi.fn().mockResolvedValue(undefined);
        renderWithProviders(
            <CanvasViewport navigation={null}>
                <CanvasConnectionModal
                    nodes={nodes}
                    edges={[]}
                    onConnect={onConnect}
                />
            </CanvasViewport>,
        );
        await user.click(screen.getByRole('button', { name: 'Expand canvas' }));
        await user.click(
            screen.getByRole('button', { name: 'Connect metrics' }),
        );
        const source = screen.getByRole('combobox', { name: 'Source metric' });
        await user.click(source);
        await user.keyboard('Revenue{ArrowDown}{Enter}');
        expect(source).toHaveValue('Revenue (orders)');
        await user.tab();
        const target = screen.getByRole('combobox', { name: 'Target metric' });
        expect(target).toHaveFocus();
        await user.keyboard('Users{ArrowDown}{Enter}');
        expect(target).toHaveValue('Users (users)');
        await user.tab();
        expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
        await user.tab();
        expect(screen.getByRole('button', { name: 'Connect' })).toHaveFocus();
        await user.keyboard('{Enter}');
        expect(onConnect).toHaveBeenCalledExactlyOnceWith({
            source: 'revenue',
            target: 'users',
            sourceHandle: null,
            targetHandle: null,
        });
        expect(
            screen.getByRole('dialog', { name: 'Metrics canvas' }),
        ).toBeVisible();
        expect(
            screen.queryByRole('dialog', { name: 'Connect metrics' }),
        ).not.toBeInTheDocument();
    });

    it('connects the chosen source to a different target using keyboard-accessible controls', async () => {
        const user = userEvent.setup();
        const onConnect = vi.fn().mockResolvedValue(undefined);
        renderWithProviders(
            <CanvasConnectionModal
                nodes={nodes}
                edges={[]}
                onConnect={onConnect}
            />,
        );
        const trigger = screen.getByRole('button', { name: 'Connect metrics' });
        trigger.focus();
        await user.keyboard('{Enter}');
        expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
        await user.click(
            screen.getByRole('combobox', { name: 'Source metric' }),
        );
        await user.click(
            screen.getByRole('option', { name: 'Revenue (orders)' }),
        );
        await user.click(
            screen.getByRole('combobox', { name: 'Target metric' }),
        );
        expect(
            within(
                screen.getByRole('listbox', { name: 'Target metric' }),
            ).queryByRole('option', { name: 'Revenue (orders)' }),
        ).not.toBeInTheDocument();
        await user.click(screen.getByRole('option', { name: 'Users (users)' }));
        screen.getByRole('button', { name: 'Connect' }).focus();
        await user.keyboard('{Enter}');
        expect(onConnect).toHaveBeenCalledExactlyOnceWith({
            source: 'revenue',
            target: 'users',
            sourceHandle: null,
            targetHandle: null,
        });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not submit an existing connection', async () => {
        const user = userEvent.setup();
        const onConnect = vi.fn().mockResolvedValue(undefined);
        renderWithProviders(
            <CanvasConnectionModal
                nodes={nodes}
                edges={[{ id: 'existing', source: 'revenue', target: 'users' }]}
                onConnect={onConnect}
            />,
        );
        await user.click(
            screen.getByRole('button', { name: 'Connect metrics' }),
        );
        await user.click(
            screen.getByRole('combobox', { name: 'Source metric' }),
        );
        await user.click(
            screen.getByRole('option', { name: 'Revenue (orders)' }),
        );
        await user.click(
            screen.getByRole('combobox', { name: 'Target metric' }),
        );
        await user.click(screen.getByRole('option', { name: 'Users (users)' }));
        expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
        expect(
            screen.getByText(
                'These metrics are already connected in this direction.',
            ),
        ).toBeVisible();
        expect(onConnect).not.toHaveBeenCalled();
    });
});
