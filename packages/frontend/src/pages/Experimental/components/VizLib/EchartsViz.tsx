import EChartsReact from 'echarts-for-react';
import { useMemo } from 'react';
import { type EchartsDto } from '../../Dto/VizLibDto/EchartsDto';

const EchartsViz = ({ echartsDto }: { echartsDto: EchartsDto }) => {
    const options = useMemo(() => {
        return echartsDto.getConfig();
    }, [echartsDto]);

    return (
        <EChartsReact
            style={{
                minHeight: 300,
                height: '100%',
                width: '100%',
            }}
            option={options}
            notMerge
        />
    );
};

export default EchartsViz;
