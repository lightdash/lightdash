import { useMemo } from 'react';
import { VegaLite } from 'react-vega';
import { type VegaDto } from '../../Dto/VizLibDto/VegaDto';

const VegaViz = ({ vegaDto }: { vegaDto: VegaDto }) => {
    const options = useMemo(() => {
        return vegaDto.getConfig();
    }, [vegaDto]);

    return (
        <VegaLite
            style={{
                width: '100%',
                height: '100%',
                minHeight: 300,
            }}
            //@ts-ignore
            spec={options}
        />
    );
};

export default VegaViz;
