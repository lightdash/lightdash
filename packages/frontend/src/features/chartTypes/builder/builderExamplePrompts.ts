/** The four starter cards, by the shape each one draws. */
export type BuilderPromptExampleKey =
    | 'stream'
    | 'funnel'
    | 'heatmap'
    | 'waterfall';

/** Per-card prompt overrides; null keeps that card's own wording. */
export type BuilderPromptExamples = Record<
    BuilderPromptExampleKey,
    string | null
>;
