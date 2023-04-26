import { MantineProvider as MantineProviderBase } from '@mantine/core';
import { FC } from 'react';
import { getMantineThemeOverride } from '../mantineTheme';

const MantineProvider: FC = ({ children }) => {
    return (
        <MantineProviderBase
            withGlobalStyles
            withNormalizeCSS
            inherit
            withCSSVariables
            theme={getMantineThemeOverride()}
        >
            {children}
        </MantineProviderBase>
    );
};

export default MantineProvider;
