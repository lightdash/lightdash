import { z } from 'zod';
import { type AbstractResultTransformer } from '../ResultTransformers';

export const vizConfigSchema = z.object({
    type: z.string(),
});

export type VizConfig = z.infer<typeof vizConfigSchema>;

export interface VizConfigTransformerArguments {
    vizConfig: VizConfig;
    resultsTransformer: AbstractResultTransformer;
}

export abstract class AbstractVizConfigTransformer<
    T extends VizConfig = VizConfig,
> {
    /**
     * Unique identifier for the vizConfig transformer
     */
    static type: string;

    protected readonly resultsTransformer: AbstractResultTransformer;

    protected vizConfig: T;

    constructor(args: VizConfigTransformerArguments) {
        this.resultsTransformer = args.resultsTransformer;
        this.vizConfig = args.vizConfig as T;
    }

    /**
     * Transforms and returns the data necessary based on the type of vizConfig
     */
    public getRows() {
        return this.resultsTransformer.getRows();
    }

    /**
     * Returns the valid vizConfig object
     */
    public getVizConfig() {
        return this.vizConfig;
    }
}
