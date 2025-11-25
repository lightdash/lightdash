import {
    MantineProvider as MantineProviderBase,
    type MantineThemeOverride,
} from '@mantine-8/core';
import { useMantineColorScheme } from '@mantine/core';
import { useMemo, type FC } from 'react';

import { getMantine8ThemeOverride } from '../mantine8Theme';

type Props = {
    themeOverride?: MantineThemeOverride;
    notificationsLimit?: number;
};

const Mantine8Provider: FC<React.PropsWithChildren<Props>> = ({
    children,
    themeOverride = {},
}) => {
    const { colorScheme } = useMantineColorScheme();
    const theme = useMemo(
        () => getMantine8ThemeOverride(colorScheme),
        [colorScheme],
    );

    return (
        <MantineProviderBase
            theme={{ ...theme, ...themeOverride }}
            forceColorScheme={colorScheme}
            classNamesPrefix="mantine-8"
        >
            {children}
        </MantineProviderBase>
    );
};

export default Mantine8Provider;
