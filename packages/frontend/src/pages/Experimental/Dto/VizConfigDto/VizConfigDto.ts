import { type VizConfiguration } from '../../types';
import { type QuerySourceDto } from '../QuerySourceDto/QuerySourceDto';
import VizLibDtoFactory from '../VizLibDto';

export interface VizConfigDtoArguments {
    vizConfig: VizConfiguration;
    sourceDto: QuerySourceDto;
}

export abstract class VizConfigDto<
    T extends VizConfiguration = VizConfiguration,
> {
    static vizType: string;

    protected readonly sourceDto: QuerySourceDto;

    protected vizConfig: T;

    constructor(args: VizConfigDtoArguments) {
        this.sourceDto = args.sourceDto;
        this.vizConfig = this.validVizConfig(args.vizConfig);
    }

    private validVizConfig(value: VizConfiguration): T {
        return {
            ...value,
            libType: this.validateLibType(value),
        } as T;
    }

    private validateLibType(value: VizConfiguration) {
        const libsThatSupportVizType = VizLibDtoFactory.listVizLibs(
            value.vizType,
        );
        if (libsThatSupportVizType.length === 0) {
            throw new Error(`Unsupported viz type: ${value}`);
        }
        if (libsThatSupportVizType.includes(value.libType)) {
            return value.libType;
        }
        return libsThatSupportVizType[0];
    }

    public getVizConfig() {
        return this.vizConfig;
    }
}
