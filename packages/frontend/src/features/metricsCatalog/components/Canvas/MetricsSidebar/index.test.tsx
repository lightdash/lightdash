import { TimeFrames } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MetricsSidebar from './index';

const node = {
    id: 'metric-id',
    position: { x: 0, y: 0 },
    data: {
        label: 'Total completed order amount',
        tableName: 'orders',
        metricName: 'total_completed_order_amount',
        timeFrame: TimeFrames.MONTH,
    },
};

describe('MetricsSidebar', () => {
    it('adds a metric by an accessible button and preserves dragging', () => {
        const onAddMetric = vi.fn();
        render(
            <MantineProvider>
                <MetricsSidebar
                    compact={false}
                    opened={false}
                    onClose={vi.fn()}
                    nodes={[node]}
                    yamlDriversByTarget={new Map()}
                    onAddMetric={onAddMetric}
                />
            </MantineProvider>,
        );
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Add Total completed order amount to canvas',
            }),
        );
        expect(onAddMetric).toHaveBeenCalledExactlyOnceWith(node);
        const setData = vi.fn();
        fireEvent.dragStart(
            screen.getByText(node.data.label).closest('[draggable]')!,
            {
                dataTransfer: { setData },
            },
        );
        expect(setData).toHaveBeenCalledWith('application/reactflow', node.id);
    });
    it('filters metric choices and closes the chooser after adding a result', () => {
        const onAddMetric = vi.fn();
        const onClose = vi.fn();
        const otherNode = {
            ...node,
            id: 'other',
            data: {
                ...node.data,
                label: 'Total customers',
                tableName: 'customers',
            },
        };
        render(
            <MantineProvider>
                <MetricsSidebar
                    compact={false}
                    opened={false}
                    onClose={onClose}
                    nodes={[node, otherNode]}
                    yamlDriversByTarget={new Map()}
                    onAddMetric={onAddMetric}
                />
            </MantineProvider>,
        );
        fireEvent.change(
            screen.getByRole('searchbox', { name: 'Search metrics' }),
            { target: { value: 'customers' } },
        );
        expect(
            screen.queryByRole('button', {
                name: 'Add Total completed order amount to canvas',
            }),
        ).not.toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Add Total customers to canvas',
            }),
        );
        expect(onAddMetric).toHaveBeenCalledExactlyOnceWith(otherNode);
        expect(onClose).toHaveBeenCalledOnce();
    });
});
