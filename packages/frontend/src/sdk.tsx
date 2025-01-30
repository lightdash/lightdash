/* eslint-disable react-refresh/only-export-components */
import MantineIcon from './components/common/MantineIcon';
import MantineProvider from './providers/MantineProvider';
import './styles/react-grid.css';

export type TestArgs = {
    name: string;
};

export const test = (args: TestArgs) => {
    return 'hello' + args.name;
};

export { MantineProvider, MantineIcon };
