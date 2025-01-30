/* eslint-disable react-refresh/only-export-components */
import { type FC } from 'react';
import MantineIcon from './components/common/MantineIcon';
import MantineProvider from './providers/MantineProvider';
import './styles/react-grid.css';

export type TestArgs = {
    name: string;
};

export const test = (args: TestArgs) => {
    return 'hello' + args.name;
};

export const TestFrontendForSdk: FC = () => {
    return <div>hello from lightdash frontend</div>;
};

export { MantineProvider, MantineIcon };
