import { type VizConfiguration } from '../../types';
import { type QuerySourceDto } from '../QuerySourceDto/QuerySourceDto';
import VizLibDtoFactory from '../VizLibDto';
import { type VizLibDto } from '../VizLibDto/VizLibDto';

interface Arguments {
    vizConfig?: VizConfiguration;
    sourceDto: QuerySourceDto;
}

export class VizConfigDto implements VizConfigDto {
    private readonly sourceDto: QuerySourceDto;

    private readonly vizLibDto?: VizLibDto;

    private readonly vizConfig?: VizConfiguration;

    constructor(args: Arguments) {
        this.sourceDto = args.sourceDto;
        this.vizConfig = args.vizConfig;
        this.vizLibDto = args.vizConfig?.libType
            ? VizLibDtoFactory.createVizLibDto(args.vizConfig.libType, args)
            : undefined;
    }

    public getVizLib() {
        return this.vizLibDto;
    }

    public getVizLibOptions() {
        return VizLibDtoFactory.listVizLibs();
    }

    public getVizOptions() {
        return this.vizLibDto?.getVizOptions() ?? [];
    }

    public getXAxisOptions() {
        return this.sourceDto.getFieldOptions();
    }

    public getYAxisOptions() {
        return this.sourceDto.getFieldOptions();
    }

    public getPivotOptions() {
        return this.sourceDto.getPivotOptions();
    }
}
