import { TimeFrames } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { PanelGroup } from 'react-resizable-panels';
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
                <PanelGroup direction="horizontal">
                    <MetricsSidebar
                        nodes={[node]}
                        yamlDriversByTarget={new Map()}
                        onAddMetric={onAddMetric}
                    />
                </PanelGroup>
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
});
