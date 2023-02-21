import { MantineProvider as MantineProviderBase } from '@mantine/core';
import { FC } from 'react';

const MantineProvider: FC = ({ children }) => {
    return (
        <MantineProviderBase withGlobalStyles withNormalizeCSS>
            {children}
        </MantineProviderBase>
    );
};

export default MantineProvider;
