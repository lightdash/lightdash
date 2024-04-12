import { BarConfigDto } from './BarConfigDto';
import { LineConfigDto } from './LineConfigDto';
import { type VizConfigDto, type VizConfigDtoArguments } from './VizConfigDto';

export default class VizConfigDtoFactory {
    static listVizConfigs(): string[] {
        return [BarConfigDto.vizType, LineConfigDto.vizType];
    }

    static createVizConfigDto(args: VizConfigDtoArguments): VizConfigDto {
        switch (args.vizConfig.vizType) {
            case BarConfigDto.vizType:
                return new BarConfigDto(args);
            case LineConfigDto.vizType:
                return new LineConfigDto(args);
            default:
                throw new Error(
                    `Unsupported viz config: ${args.vizConfig.vizType}`,
                );
        }
    }
}
