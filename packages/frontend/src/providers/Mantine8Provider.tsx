import {
    MantineProvider as MantineProviderBase,
    type MantineThemeOverride,
} from '@mantine-8/core';
import { type FC } from 'react';

import { getMantine8ThemeOverride } from '../mantine8Theme';

type Props = {
    theme?: MantineThemeOverride;
    themeOverride?: MantineThemeOverride;
    notificationsLimit?: number;
};

const Mantine8Provider: FC<React.PropsWithChildren<Props>> = ({
    children,
    theme = getMantine8ThemeOverride(),
    themeOverride = {},
}) => {
    return (
        <MantineProviderBase
            theme={{ ...theme, ...themeOverride }}
            forceColorScheme="light"
            classNamesPrefix="mantine-8"
        >
            {children}
        </MantineProviderBase>
    );
};

export default Mantine8Provider;
