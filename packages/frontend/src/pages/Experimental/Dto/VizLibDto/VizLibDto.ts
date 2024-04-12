import { type VizConfiguration } from '../../types';
import { type QuerySourceDto } from '../QuerySourceDto/QuerySourceDto';

export interface VizLibDtoArguments {
    vizConfig?: VizConfiguration;
    sourceDto: QuerySourceDto;
}

export abstract class VizLibDto {
    static type: string;

    protected readonly sourceDto: QuerySourceDto;

    protected readonly vizConfig?: VizConfiguration;

    constructor(args: VizLibDtoArguments) {
        this.sourceDto = args.sourceDto;
        this.vizConfig = args.vizConfig;
    }

    abstract getType(): string;

    abstract getVizOptions(): string[];

    abstract getConfig(): unknown;
}
