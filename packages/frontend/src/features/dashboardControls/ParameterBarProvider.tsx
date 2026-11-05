import { type FC, type ReactNode } from 'react';
import {
    ParameterBarContext,
    useBuildParameterBar,
} from './useParameterBarControls';

/** Builds the bar's parameter model once, for every pass to read. */
export const ParameterBarProvider: FC<{ children: ReactNode }> = ({
    children,
}) => (
    <ParameterBarContext.Provider value={useBuildParameterBar()}>
        {children}
    </ParameterBarContext.Provider>
);
