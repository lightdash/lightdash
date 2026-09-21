import {
    type AiAgentMessageAssistant,
    type AiArtifact,
    type ToolDashboardV2Args,
} from '@lightdash/common';
import { Text } from '@mantine/core';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { AiDashboardVisualization } from './AiDashboardVisualization';

vi.mock('../../store/hooks', () => ({
    useAiAgentStoreDispatch: () => vi.fn(),
}));
vi.mock('./AiDashboardQuickOptions', () => ({
    AiDashboardQuickOptions: () => null,
}));
vi.mock('./AiDashboardVisualizationItem', () => ({
    AiDashboardVisualizationItem: ({
        visualization,
        index,
    }: {
        visualization: { title: string };
        index: number;
    }) => (
        <Text data-testid="visualization" data-query-index={index}>
            {visualization.title}
        </Text>
    ),
}));
const dashboard: ToolDashboardV2Args = {
    title: 'Overview',
    description: '',
    visualizations: ['Detail', 'Summary', 'Trend'].map((title) => ({
        title,
        description: '',
        chartConfig: null,
        mergeConfig: null,
        queryConfig: {
            exploreName: 'orders',
            dimensions: [],
            metrics: ['orders_count'],
            filters: null,
            sorts: [],
            limit: 500,
            customMetrics: null,
            tableCalculations: null,
            parameters: null,
        },
    })),
};
const show = (dashboardConfig: ToolDashboardV2Args) =>
    renderWithProviders(
        <AiDashboardVisualization
            artifactData={
                {
                    threadUuid: 'thread',
                    artifactUuid: 'artifact',
                    versionUuid: 'version',
                } as AiArtifact
            }
            projectUuid="project"
            agentUuid="agent"
            dashboardConfig={dashboardConfig}
            message={{} as AiAgentMessageAssistant}
        />,
    );

describe('dashboard preview layout', () => {
    it('renders visual reading order while keeping the query index tied to the original chart', () => {
        show({
            ...dashboard,
            layout: {
                template: 'overview',
                positions: [
                    { x: 0, y: 14, w: 36, h: 10 },
                    { x: 0, y: 0, w: 36, h: 4 },
                    { x: 0, y: 4, w: 36, h: 10 },
                ],
            },
        });
        const tiles = screen.getAllByTestId('visualization');
        expect(tiles.map((tile) => tile.textContent)).toEqual([
            'Summary',
            'Trend',
            'Detail',
        ]);
        expect(
            tiles.map((tile) => tile.getAttribute('data-query-index')),
        ).toEqual(['1', '2', '0']);
        expect(
            screen.getByRole('button', { name: 'Close preview' }),
        ).toBeInTheDocument();
    });

    it.each([
        undefined,
        {
            template: 'balanced' as const,
            positions: [{ x: 0, y: 0, w: 36, h: 10 }],
        },
    ])('retains every chart when layout is absent or invalid', (layout) => {
        show({ ...dashboard, layout });
        expect(
            screen
                .getAllByTestId('visualization')
                .map((tile) => tile.textContent),
        ).toEqual(['Detail', 'Summary', 'Trend']);
    });
});
