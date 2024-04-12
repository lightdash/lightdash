import { EchartsDto } from './EchartsDto';
import { TableDto } from './TableDto';
import { VegaDto } from './VegaDto';
import { type VizLibDto, type VizLibDtoArguments } from './VizLibDto';

export default class VizLibDtoFactory {
    static vizLibs = [EchartsDto, VegaDto, TableDto];

    static listVizLibs(vizType: string): string[] {
        return VizLibDtoFactory.vizLibs
            .filter((c) => c.supportedVizTypes.includes(vizType))
            .map((c) => c.type);
    }

    static createVizLibDto(args: VizLibDtoArguments): VizLibDto {
        switch (args.vizConfig?.libType) {
            case EchartsDto.type:
                return new EchartsDto(args);
            case VegaDto.type:
                return new VegaDto(args);
            case TableDto.type:
                return new TableDto(args as any);
            default:
                throw new Error(
                    `Unsupported viz library: ${args.vizConfig?.libType}`,
                );
        }
    }
}
