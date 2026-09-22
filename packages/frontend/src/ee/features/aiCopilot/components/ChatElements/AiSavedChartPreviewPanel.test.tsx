import { Ability } from '@casl/ability';
import { ChartType, type PossibleAbilities } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AbilityContext } from '../../../../../providers/Ability/context';
import { renderWithProviders } from '../../../../../testing/testUtils';
import EmbedProviderContext from '../../../../providers/Embed/context';
import { AiSavedChartPreviewPanel } from './AiSavedChartPreviewPanel';

const mocks = vi.hoisted(() => ({
    isEmbed: vi.fn(),
    onExplore: vi.fn(),
}));
vi.mock('../../hooks/aiAgentRouting', () => ({
    isEmbedAiAgentRoute: () => mocks.isEmbed(),
}));
vi.mock('../../store/hooks', () => ({
    useAiAgentStoreDispatch: () => vi.fn(),
}));
vi.mock('../../../../../hooks/useContentAuthoringEnabled', () => ({
    useContentAuthoringEnabled: () => true,
}));
vi.mock('./AiSavedChartVisualization', () => ({
    AiSavedChartVisualization: () => <div data-testid="visualization" />,
}));

const savedChart = {
    uuid: 'chart-uuid',
    name: 'Orders by status',
    description: undefined,
    verification: null,
    tableName: 'orders',
    chartConfig: { type: ChartType.TABLE, config: {} },
    tableConfig: { columnOrder: [] },
};
vi.mock('../../../../../hooks/useSavedQuery', () => ({
    useSavedQuery: () => ({
        data: savedChart,
        isInitialLoading: false,
        isError: false,
    }),
}));

const preview = {
    type: 'savedChart' as const,
    savedChartUuid: savedChart.uuid,
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
    threadUuid: 'thread-uuid',
    messageUuid: 'message-uuid',
};

const renderPanel = ({
    isEmbed,
    canExplore = false,
    scopes = [] as PossibleAbilities['subject'][],
}: {
    isEmbed: boolean;
    canExplore?: boolean;
    scopes?: PossibleAbilities['subject'][];
}) => {
    mocks.isEmbed.mockReturnValue(isEmbed);
    const ability = new Ability<PossibleAbilities>(
        scopes.map((subject) => ({ subject, action: 'view' })),
    );
    return renderWithProviders(
        <AbilityContext.Provider value={ability}>
            <EmbedProviderContext.Provider
                value={{
                    embedToken: isEmbed ? 'token' : undefined,
                    projectUuid: preview.projectUuid,
                    content: isEmbed
                        ? {
                              type: 'aiAgent',
                              agentUuid: 'agent-uuid',
                              canExplore,
                          }
                        : undefined,
                    onExplore: mocks.onExplore,
                    t: () => undefined,
                    mode: 'direct',
                    theme: 'light',
                    backgroundColor: null,
                    timezone: null,
                }}
            >
                <AiSavedChartPreviewPanel savedChartPreview={preview} />
            </EmbedProviderContext.Provider>
        </AbilityContext.Provider>,
    );
};

describe('AiSavedChartPreviewPanel', () => {
    beforeEach(() => {
        mocks.onExplore.mockReset();
    });

    it('hides the explore action in an embed whose token does not grant it', () => {
        renderPanel({ isEmbed: true });

        expect(screen.getByTestId('visualization')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'More options' }),
        ).not.toBeInTheDocument();
    });

    it('keeps explore inside the embed when the token grants canExplore', async () => {
        renderPanel({ isEmbed: true, canExplore: true });

        fireEvent.click(screen.getByRole('button', { name: 'More options' }));
        const explore = await screen.findByText('Explore from here');
        expect(explore.closest('a')).toBeNull();

        fireEvent.click(explore);
        expect(mocks.onExplore).toHaveBeenCalledWith({ chart: savedChart });
    });

    it('offers explore in the embed through the EmbedExplore scope', () => {
        renderPanel({ isEmbed: true, scopes: ['EmbedExplore'] });

        expect(
            screen.getByRole('button', { name: 'More options' }),
        ).toBeInTheDocument();
    });

    it('links to the full app outside an embed', async () => {
        renderPanel({ isEmbed: false });

        fireEvent.click(screen.getByRole('button', { name: 'More options' }));
        const explore = await screen.findByText('Explore from here');
        expect(explore.closest('a')).toHaveAttribute(
            'href',
            `/projects/${preview.projectUuid}/saved/${savedChart.uuid}/view`,
        );
        expect(mocks.onExplore).not.toHaveBeenCalled();
    });
});
