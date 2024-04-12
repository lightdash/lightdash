import { EchartsDto } from '../../Dto/VizLibDto/EchartsDto';
import { VegaDto } from '../../Dto/VizLibDto/VegaDto';
import { type VizLibDto } from '../../Dto/VizLibDto/VizLibDto';
import EchartsViz from './EchartsViz';
import VegaViz from './VegaViz';

const VizLib = ({ vizLibDto }: { vizLibDto: VizLibDto }) => {
    switch (vizLibDto.getType()) {
        case EchartsDto.type:
            return <EchartsViz echartsDto={vizLibDto as EchartsDto} />;
        case VegaDto.type:
            return <VegaViz vegaDto={vizLibDto as VegaDto} />;
        default:
            return <div>Unsupported viz library</div>;
    }
};

export default VizLib;
