import { EchartsDto } from '../../Dto/VizLibDto/EchartsDto';
import { type VizLibDto } from '../../Dto/VizLibDto/VizLibDto';
import EchartsViz from './EchartsViz';

const VizLib = ({ vizLibDto }: { vizLibDto: VizLibDto }) => {
    switch (vizLibDto.getType()) {
        case EchartsDto.type:
            return <EchartsViz echartsDto={vizLibDto as EchartsDto} />;
        default:
            return <div>Unsupported viz library</div>;
    }
};

export default VizLib;
