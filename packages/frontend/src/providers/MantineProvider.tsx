import { MantineProvider as MantineProviderBase } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { FC } from 'react';

import { getMantineThemeOverride } from '../mantineTheme';

const MantineProvider: FC<React.PropsWithChildren<{}>> = ({ children }) => {
    return (
        <MantineProviderBase
            withGlobalStyles
            withNormalizeCSS
            withCSSVariables
            theme={getMantineThemeOverride()}
        >
            {children}

            <Notifications />
        </MantineProviderBase>
    );
};

export default MantineProvider;
