import { type CatalogMetricsTreeEdge } from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';
import { type CanvasMetric } from './canvasLayoutUtils';
import { useCanvasFlow } from './useCanvasFlow';

vi.mock('../../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastInfo: vi.fn() }),
}));
const metrics: CanvasMetric[] = [
    {
        catalogSearchUuid: 'target',
        name: 'total_completed_order_amount',
        label: 'Total completed order amount',
        tableName: 'orders',
    },
    {
        catalogSearchUuid: 'driver',
        name: 'total_order_amount',
        label: 'Total order amount',
        tableName: 'orders',
    },
];
const edges: CatalogMetricsTreeEdge[] = [];

describe('useCanvasFlow click-to-add', () => {
    it('adds distinct metrics without overlapping and removes them from the sidebar', () => {
        const { result } = renderHook(
            () => useCanvasFlow({ metrics, edges, viewOnly: false }),
            { wrapper: ReactFlowProvider },
        );
        act(() => result.current.addMetricsToCanvas([metrics[0]]));
        act(() => result.current.addMetricsToCanvas([metrics[1]]));
        act(() => result.current.addMetricsToCanvas([metrics[0]]));
        expect(result.current.currentNodes).toHaveLength(2);
        expect(result.current.sidebarNodes).toHaveLength(0);
        expect(result.current.currentNodes[0].position).not.toEqual(
            result.current.currentNodes[1].position,
        );
    });

    it('keeps YAML driver placement above its target', () => {
        const { result } = renderHook(
            () => useCanvasFlow({ metrics, edges, viewOnly: false }),
            { wrapper: ReactFlowProvider },
        );
        act(() => result.current.addMetricsToCanvas([metrics[0]]));
        act(() => result.current.addMetricsToCanvas([metrics[1]], 'target'));
        const [target, driver] = result.current.currentNodes;
        expect(driver.position.x).toBe(target.position.x);
        expect(driver.position.y).toBeLessThan(target.position.y);
    });

    it('cannot add metrics in view-only mode', () => {
        const { result } = renderHook(
            () => useCanvasFlow({ metrics, edges, viewOnly: true }),
            { wrapper: ReactFlowProvider },
        );
        const before = result.current.currentNodes;
        act(() => result.current.addMetricsToCanvas([metrics[0]]));
        expect(result.current.currentNodes).toEqual(before);
    });
});
