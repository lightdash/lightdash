import { ChartKind, type AiPromptContextItem } from '@lightdash/common';

const dashboard = (uuid: string, name: string): AiPromptContextItem => ({
    type: 'dashboard',
    dashboardUuid: uuid,
    dashboardSlug: uuid,
    displayName: name,
    pinnedVersionUuid: null,
    runtimeOverrides: null,
});

const chart = (
    uuid: string,
    name: string,
    chartKind: ChartKind,
): AiPromptContextItem => ({
    type: 'chart',
    chartUuid: uuid,
    chartSlug: uuid,
    displayName: name,
    pinnedVersionUuid: null,
    runtimeOverrides: null,
    chartKind,
});

export const pinnedDashboard = dashboard('jaffle', 'Jaffle dashboard');

export const fewPinnedItems: AiPromptContextItem[] = [
    pinnedDashboard,
    chart('orders', 'How many orders we have over time', ChartKind.LINE),
];

export const manyPinnedItems: AiPromptContextItem[] = [
    ...fewPinnedItems,
    chart('revenue', 'Revenue by payment method', ChartKind.VERTICAL_BAR),
    dashboard('marketing', 'Marketing overview'),
    chart('aov', 'Average order value by week', ChartKind.LINE),
    chart('returning', 'Returning customers', ChartKind.VERTICAL_BAR),
];
