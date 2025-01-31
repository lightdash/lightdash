/* eslint-disable @typescript-eslint/no-unused-vars */
import MantineIcon from '../components/common/MantineIcon';
import VisualizationProvider from '../components/LightdashVisualization/VisualizationProvider';
import SimpleStatistic from '../components/SimpleStatistic';
import MantineProvider from '../providers/MantineProvider';
import '../styles/react-grid.css';
import { TestFrontendForSdk } from './SdkTests';

export type TestArgs = {
    name: string;
};

export const test = (args: TestArgs) => {
    return 'hello' + args.name;
};

export {
    MantineProvider,
    MantineIcon,
    TestFrontendForSdk,
    SimpleStatistic,
    VisualizationProvider,
};
