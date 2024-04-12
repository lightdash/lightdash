import { EchartsDto } from './EchartsDto';
import { type VizLibDto, type VizLibDtoArguments } from './VizLibDto';

export default class VizLibDtoFactory {
    static listVizLibs(): string[] {
        return [EchartsDto.type];
    }

    static createVizLibDto(type: string, args: VizLibDtoArguments): VizLibDto {
        switch (type) {
            case EchartsDto.type:
                return new EchartsDto(args);
            default:
                throw new Error(`Unsupported viz library: ${type}`);
        }
    }
}
