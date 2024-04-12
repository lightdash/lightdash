import { type CartesianConfig } from '../../types';
import { type QuerySourceDto } from '../QuerySourceDto/QuerySourceDto';

export interface VizLibDtoArguments {
    vizConfig?: CartesianConfig;
    sourceDto: QuerySourceDto;
}

export abstract class VizLibDto {
    static type: string;

    static supportedVizTypes: string[];

    protected readonly sourceDto: QuerySourceDto;

    protected readonly vizConfig?: CartesianConfig;

    constructor(args: VizLibDtoArguments) {
        this.sourceDto = args.sourceDto;
        this.vizConfig = args.vizConfig;
    }

    abstract getType(): string;

    abstract getConfig(): unknown;
}
