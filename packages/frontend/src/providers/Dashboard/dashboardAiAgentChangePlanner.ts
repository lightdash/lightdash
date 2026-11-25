import {
    assertUnreachable,
    isDashboardChartTileType,
    isDashboardComposerChartTile,
    isDashboardSqlChartTile,
    type DashboardChartTile,
    type DashboardComposerChartTile,
    type DashboardSqlChartTile,
    type DashboardTile,
} from '@lightdash/common';
import { type StreamPart } from '../../ee/features/aiCopilot/store/aiAgentThreadStreamSlice';

type SuccessfulContentToolCall = Extract<StreamPart, { type: 'toolCall' }> & {
    toolName: 'createContent' | 'editContent';
    isPreliminary: false;
    toolResult: {
        metadata: {
            status: 'success';
            slug: string;
        };
    };
};

export type DashboardAiAgentChartRef = {
    type: 'chart' | 'sql_chart' | 'composer_chart';
    slug: string;
};

export type DashboardAiAgentChangeAction =
    | {
          type: 'refreshDashboard';
          focusChart: DashboardAiAgentChartRef | null;
      }
    | {
          type: 'refreshChart';
          chart: DashboardAiAgentChartRef;
          focusTile: boolean;
      };

export type DashboardAiAgentChangePlan = {
    handledToolCallIds: string[];
    actions: DashboardAiAgentChangeAction[];
    pendingChartToFocus: DashboardAiAgentChartRef | null;
};

const isSuccessfulContentToolCall = (
    part: StreamPart,
): part is SuccessfulContentToolCall =>
    part.type === 'toolCall' &&
    (part.toolName === 'createContent' || part.toolName === 'editContent') &&
    part.isPreliminary === false &&
    part.toolResult?.metadata.status === 'success';

const getContentSlug = (part: SuccessfulContentToolCall) =>
    part.toolResult.metadata.slug;

const getTargetDashboardSlug = (part: SuccessfulContentToolCall) =>
    part.toolName === 'createContent' &&
    'dashboardSlug' in part.toolArgs.content
        ? part.toolArgs.content.dashboardSlug
        : undefined;

export const planDashboardAiAgentChanges = ({
    parts,
    handledToolCallIds,
    quietToolCallIds,
    currentDashboardSlug,
    pendingChartToFocus,
}: {
    parts: StreamPart[];
    handledToolCallIds: Set<string>;
    /** Their changes are refreshed in place: the page is not scrolled to them. */
    quietToolCallIds: Set<string>;
    currentDashboardSlug: string;
    pendingChartToFocus: DashboardAiAgentChartRef | null;
}): DashboardAiAgentChangePlan => {
    const actions: DashboardAiAgentChangeAction[] = [];
    const nextHandledToolCallIds: string[] = [];
    let nextPendingChartToFocus = pendingChartToFocus;

    for (const part of parts) {
        if (!isSuccessfulContentToolCall(part)) continue;
        if (handledToolCallIds.has(part.toolCallId)) continue;

        nextHandledToolCallIds.push(part.toolCallId);

        const contentSlug = getContentSlug(part);
        const focus = !quietToolCallIds.has(part.toolCallId);

        switch (part.toolArgs.type) {
            case 'chart': {
                const chart: DashboardAiAgentChartRef = {
                    type: 'chart',
                    slug: contentSlug,
                };
                const targetDashboardSlug = getTargetDashboardSlug(part);
                if (
                    part.toolName === 'createContent' &&
                    targetDashboardSlug === currentDashboardSlug
                ) {
                    if (focus) nextPendingChartToFocus = chart;
                    actions.push({
                        type: 'refreshDashboard',
                        focusChart: focus ? chart : null,
                    });
                    break;
                }

                actions.push({ type: 'refreshChart', chart, focusTile: focus });
                break;
            }
            case 'sql_chart': {
                const chart: DashboardAiAgentChartRef = {
                    type: 'sql_chart',
                    slug: contentSlug,
                };
                // SQL charts are created outside dashboards; focus once a dashboard edit adds the tile.
                if (part.toolName === 'createContent') {
                    if (focus) nextPendingChartToFocus = chart;
                    break;
                }

                actions.push({ type: 'refreshChart', chart, focusTile: focus });
                break;
            }
            case 'composer_chart': {
                const chart: DashboardAiAgentChartRef = {
                    type: 'composer_chart',
                    slug: contentSlug,
                };
                // A create adds a tile, so the dashboard reloads to show it.
                if (part.toolName === 'createContent') {
                    if (getTargetDashboardSlug(part) === currentDashboardSlug) {
                        actions.push({
                            type: 'refreshDashboard',
                            focusChart: focus ? chart : null,
                        });
                    }
                    break;
                }
                actions.push({ type: 'refreshChart', chart, focusTile: focus });
                break;
            }
            case 'dashboard': {
                if (contentSlug !== currentDashboardSlug) break;

                actions.push({
                    type: 'refreshDashboard',
                    focusChart: focus ? nextPendingChartToFocus : null,
                });
                break;
            }
            case 'document':
                break;
            default:
                return assertUnreachable(
                    part.toolArgs.type,
                    'Unknown content type',
                );
        }
    }

    return {
        handledToolCallIds: nextHandledToolCallIds,
        actions,
        pendingChartToFocus: nextPendingChartToFocus,
    };
};

export type DashboardAiAgentChartTiles =
    | { type: 'chart'; tiles: DashboardChartTile[] }
    | { type: 'sql_chart'; tiles: DashboardSqlChartTile[] }
    | { type: 'composer_chart'; tiles: DashboardComposerChartTile[] };

export const getDashboardTilesForChart = (
    tiles: DashboardTile[],
    chart: DashboardAiAgentChartRef,
): DashboardAiAgentChartTiles => {
    switch (chart.type) {
        case 'chart':
            return {
                type: 'chart',
                tiles: tiles.filter(
                    (tile): tile is DashboardChartTile =>
                        isDashboardChartTileType(tile) &&
                        tile.properties.chartSlug === chart.slug &&
                        !!tile.properties.savedChartUuid,
                ),
            };
        case 'sql_chart':
            return {
                type: 'sql_chart',
                tiles: tiles.filter(
                    (tile): tile is DashboardSqlChartTile =>
                        isDashboardSqlChartTile(tile) &&
                        tile.properties.chartSlug === chart.slug &&
                        !!tile.properties.savedSqlUuid,
                ),
            };
        case 'composer_chart':
            return {
                type: 'composer_chart',
                tiles: tiles.filter(
                    (tile): tile is DashboardComposerChartTile =>
                        isDashboardComposerChartTile(tile) &&
                        tile.properties.chartSlug === chart.slug &&
                        !!tile.properties.composerChartUuid,
                ),
            };
        default:
            return assertUnreachable(chart.type, 'Unknown chart type');
    }
};
