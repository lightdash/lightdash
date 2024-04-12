import { EchartsDto } from '../../Dto/VizLibDto/EchartsDto';
import { TableDto } from '../../Dto/VizLibDto/TableDto';
import { VegaDto } from '../../Dto/VizLibDto/VegaDto';
import { type VizLibDto } from '../../Dto/VizLibDto/VizLibDto';
import EchartsViz from './EchartsViz';
import TableViz from './TableViz';
import VegaViz from './VegaViz';

const VizLib = ({ vizLibDto }: { vizLibDto: VizLibDto }) => {
    switch (vizLibDto.getType()) {
        case EchartsDto.type:
            return <EchartsViz echartsDto={vizLibDto as EchartsDto} />;
        case VegaDto.type:
            return <VegaViz vegaDto={vizLibDto as VegaDto} />;
        case TableDto.type:
            return <TableViz tableDto={vizLibDto as TableDto} />;
        default:
            return <div>Unsupported viz library</div>;
    }
};

export default VizLib;
