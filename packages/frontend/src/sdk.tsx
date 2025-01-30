/* eslint-disable react-refresh/only-export-components */

import MantineIcon from './components/common/MantineIcon';

export type TestArgs = {
    name: string;
};

export const test = (args: TestArgs) => {
    return 'hello' + args.name;
};

export { MantineIcon };
