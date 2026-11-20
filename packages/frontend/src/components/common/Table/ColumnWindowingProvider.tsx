import { FeatureFlags } from '@lightdash/common';
import { type FC, type PropsWithChildren } from 'react';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { ColumnWindowingContext } from './ColumnWindowingContext';

// Resolves the flag once per tree so tables only read a boolean from context.
export const ColumnWindowingProvider: FC<
    PropsWithChildren<{ enabled: boolean }>
> = ({ enabled, children }) => {
    const flag = useServerFeatureFlag(FeatureFlags.TableColumnVirtualization, {
        enabled,
    });
    return (
        <ColumnWindowingContext.Provider value={flag.data?.enabled === true}>
            {children}
        </ColumnWindowingContext.Provider>
    );
};
