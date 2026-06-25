import { waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';

/**
 * Guards the CSP fix from #21276 for custom (Vega-Lite) visualizations.
 *
 * react-vega's VegaEmbed compiles a Vega-Lite spec's expressions with the
 * `Function()` constructor at render, which a strict CSP (`script-src` without
 * `'unsafe-eval'`) blocks — so an embedded dashboard with a custom-viz tile
 * threw `EvalError` and rendered blank. Passing `ast: true` switches vega-embed
 * to its AST expression interpreter (no codegen). This is a runtime option
 * invisible to a bundle-text grep, so it needs its own behavioural guard.
 */

const { captured } = vi.hoisted(() => ({
    captured: { current: null as { options?: Record<string, unknown> } | null },
}));

// Capture the props VegaEmbed is rendered with (it is lazy-imported by the
// component, so the dynamic import resolves to this mock).
vi.mock('react-vega', () => ({
    VegaEmbed: (props: { options?: Record<string, unknown> }) => {
        captured.current = props;
        return null;
    },
}));

vi.mock('../LightdashVisualization/types', () => ({
    isCustomVisualizationConfig: () => true,
}));

vi.mock('../LightdashVisualization/useVisualizationContext', () => ({
    useVisualizationContext: () => ({
        isLoading: false,
        visualizationConfig: {
            chartConfig: {
                validConfig: { spec: { mark: 'bar' } },
                series: [{ x: 'a', y: 1 }],
            },
        },
        resultsData: { setFetchAll: vi.fn() },
        containerWidth: 400,
        containerHeight: 300,
    }),
}));

// eslint-disable-next-line import/first
import CustomVisualization from './index';

describe('CustomVisualization CSP (#21276)', () => {
    it('renders Vega with the AST interpreter (ast:true) instead of Function() codegen', async () => {
        renderWithProviders(<CustomVisualization />);

        await waitFor(() => expect(captured.current).not.toBeNull());

        // Without `ast: true`, vega-embed compiles expressions via Function() and
        // a strict-CSP browser throws EvalError before the chart paints.
        expect(captured.current?.options).toMatchObject({
            actions: false,
            ast: true,
        });
    });
});
