import { type VizConfiguration } from '../../types';
import { type QuerySourceDto } from '../QuerySourceDto/QuerySourceDto';

export interface VizLibDtoArguments<
    V extends VizConfiguration = VizConfiguration,
> {
    vizConfig?: V;
    sourceDto: QuerySourceDto;
}

export abstract class VizLibDto<V extends VizConfiguration = VizConfiguration> {
    static type: string;

    static supportedVizTypes: string[];

    protected readonly sourceDto: QuerySourceDto;

    protected readonly vizConfig?: V;

    constructor(args: VizLibDtoArguments<V>) {
        this.sourceDto = args.sourceDto;
        this.vizConfig = args.vizConfig;
    }

    abstract getType(): string;

    abstract getConfig(): unknown;
}
