import { z } from 'zod';
import { ChartType } from '../../../types/savedCharts';
import { type AiComposerChartViz } from '../composerArtifact';
import { chartConfigBuiltinOnlySchema } from './tools/toolRunQueryArgs';

// An explorer chart config as a person saved it from the config panel: the
// kind is checked, the per-kind config is the panel's own output.
const explorerChartConfigSchema = z.object({
    type: z.nativeEnum(ChartType),
    config: z.record(z.string(), z.unknown()).optional(),
});

export const composerVizSchema = z.object({
    intent: chartConfigBuiltinOnlySchema,
    chartConfig: explorerChartConfigSchema.nullable(),
    pivotConfig: z.object({ columns: z.array(z.string()) }).nullable(),
});

export type ParsedComposerViz =
    | { ok: true; viz: AiComposerChartViz }
    | { ok: false; error: string };

/** The viz a client sends for a composer artifact version, or why it is refused. */
export const parseComposerViz = (value: unknown): ParsedComposerViz => {
    const result = composerVizSchema.safeParse(value);
    if (!result.success) {
        return {
            ok: false,
            error: result.error.issues
                .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
                .join('; '),
        };
    }
    return {
        ok: true,
        viz: result.data as AiComposerChartViz,
    };
};
