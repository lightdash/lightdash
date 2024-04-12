import { type VizConfiguration } from '../../types';
import { type QuerySourceDto } from '../QuerySourceDto/QuerySourceDto';

export interface VizConfigDtoArguments {
    vizConfig: VizConfiguration;
    sourceDto: QuerySourceDto;
}

export abstract class VizConfigDto {
    static vizType: string;

    protected readonly sourceDto: QuerySourceDto;

    protected readonly vizConfig: VizConfiguration;

    constructor(args: VizConfigDtoArguments) {
        this.sourceDto = args.sourceDto;
        this.vizConfig = args.vizConfig;
    }

    public getVizConfig() {
        return this.vizConfig;
    }
}
