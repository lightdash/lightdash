import { EchartsDto } from './EchartsDto';
import { VegaDto } from './VegaDto';
import { type VizLibDto, type VizLibDtoArguments } from './VizLibDto';

export default class VizLibDtoFactory {
    static listVizLibs(): string[] {
        return [EchartsDto.type, VegaDto.type];
    }

    static createVizLibDto(type: string, args: VizLibDtoArguments): VizLibDto {
        switch (type) {
            case EchartsDto.type:
                return new EchartsDto(args);
            case VegaDto.type:
                return new VegaDto(args);
            default:
                throw new Error(`Unsupported viz library: ${type}`);
        }
    }
}
