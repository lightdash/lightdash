import { type FC, type ReactNode } from 'react';
import { ChartVersionPreviewContext } from './context';

const ChartVersionPreviewProvider: FC<{
    versionUuid: string | undefined;
    children: ReactNode;
}> = ({ versionUuid, children }) => (
    <ChartVersionPreviewContext.Provider value={versionUuid}>
        {children}
    </ChartVersionPreviewContext.Provider>
);

export default ChartVersionPreviewProvider;
