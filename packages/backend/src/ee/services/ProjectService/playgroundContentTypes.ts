import {
    type CreateChartInSpace,
    type CreateDashboard,
    type CreateDashboardChartTile,
    type CreateDashboardHeadingTile,
} from '@lightdash/common';

export type PlaygroundChartDefinition = Omit<
    CreateChartInSpace,
    'spaceUuid' | 'dashboardUuid'
> & {
    key: string;
    slug: string;
};

export type PlaygroundDashboardChartTile = Omit<
    CreateDashboardChartTile,
    'properties'
> & {
    properties: Omit<
        CreateDashboardChartTile['properties'],
        'savedChartUuid'
    > & {
        chartKey: string;
    };
};

export type PlaygroundDashboardDefinition = Omit<
    CreateDashboard,
    'tiles' | 'spaceUuid' | 'updatedByUser'
> & {
    slug: string;
    tiles: Array<PlaygroundDashboardChartTile | CreateDashboardHeadingTile>;
};

/**
 * A metrics catalog category. With a YAML reference it is matched to metrics
 * by that reference when the catalog is indexed; without one it is a
 * category made in the app, the kind a learner can put on a metric.
 */
export type PlaygroundCategoryDefinition = {
    yamlReference?: string;
    name: string;
    color: string;
};

/** A comment left on the dashboard tile that shows the named chart. */
export type PlaygroundCommentDefinition = {
    chartKey: string;
    text: string;
};

/**
 * A prebuilt data app: a ready version whose files (the built page the
 * runtime serves) and source (what the CLI downloads) ship with the bundle,
 * so no sandbox build runs when it is seeded.
 */
export type PlaygroundDataAppDefinition = {
    key: string;
    slug: string;
    name: string;
    description: string;
    /** What the app was asked for; shown as the version's prompt. */
    prompt: string;
    /** Built files by path under the version, e.g. `index.html`. */
    files: Record<string, string>;
    /** Source files by path, e.g. `src/App.tsx`, packed as the source archive. */
    source: Record<string, string>;
};

/** The project's AI agent, the one the Ask AI walkthrough talks to. */
export type PlaygroundAgentDefinition = {
    name: string;
    slug: string;
    description: string;
    instruction: string;
};

/**
 * A finished deep research run in a thread on the agent: the question, the
 * thread's title and the report it produced, so a learner can read one
 * without a run ever starting.
 */
export type PlaygroundDeepResearchDefinition = {
    prompt: string;
    threadTitle: string;
    /** The report: a `#` title, an introduction, `##` findings, a `## Conclusion`. */
    resultMarkdown: string;
    durationMs: number;
    warehouseQueryCount: number;
};

export type PlaygroundContent = {
    version: 1;
    space: {
        name: string;
        path: string;
    };
    charts: PlaygroundChartDefinition[];
    dashboard: PlaygroundDashboardDefinition;
    /** What the homepage pins, by chart key and dashboard slug. */
    pinned?: {
        charts?: string[];
        dashboards?: string[];
    };
    comments?: PlaygroundCommentDefinition[];
    categories?: PlaygroundCategoryDefinition[];
    dataApps?: PlaygroundDataAppDefinition[];
    agent?: PlaygroundAgentDefinition;
    deepResearch?: PlaygroundDeepResearchDefinition;
};
