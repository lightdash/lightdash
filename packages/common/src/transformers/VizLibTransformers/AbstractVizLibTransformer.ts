import { type AbstractVizConfigTransformer } from '../VizConfigTransformers';

export interface AbstractVizLibTransformerArguments<
    V extends AbstractVizConfigTransformer = AbstractVizConfigTransformer,
> {
    vizConfigTransformer: V;
}

export abstract class AbstractVizLibTransformer<
    V extends AbstractVizConfigTransformer = AbstractVizConfigTransformer,
> {
    /**
     * Unique identifier for the vizLib transformer
     */
    static type: string;

    /**
     * List of supported viz config types
     * Example: ['bar', 'table', 'pie']
     */
    static supportedVizTypes: string[];

    protected readonly vizConfigTransformer: V;

    constructor(args: AbstractVizLibTransformerArguments<V>) {
        this.vizConfigTransformer = args.vizConfigTransformer;
    }

    /**
     * Returns the type of the vizLib transformer
     */
    abstract getType(): string;

    /**
     * Returns all the necessary data to render the visualization
     */
    abstract getConfig(): unknown;
}
