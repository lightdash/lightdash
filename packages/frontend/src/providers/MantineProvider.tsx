import {
    MantineProvider as MantineProviderBase,
    type EmotionCache,
    type MantineThemeOverride,
} from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { type FC } from 'react';

import { getMantineThemeOverride } from '../mantineTheme';

type Props = {
    withGlobalStyles?: boolean;
    withNormalizeCSS?: boolean;
    withCSSVariables?: boolean;
    theme?: MantineThemeOverride;
    themeOverride?: MantineThemeOverride;
    emotionCache?: EmotionCache;
};

const MantineProvider: FC<React.PropsWithChildren<Props>> = ({
    children,
    withGlobalStyles = false,
    withNormalizeCSS = false,
    withCSSVariables = false,
    theme = getMantineThemeOverride(),
    themeOverride = {},
    emotionCache,
}) => {
    return (
        <MantineProviderBase
            withGlobalStyles={withGlobalStyles}
            withNormalizeCSS={withNormalizeCSS}
            withCSSVariables={withCSSVariables}
            theme={{ ...theme, ...themeOverride }}
            emotionCache={emotionCache}
        >
            {children}

            <Notifications />
        </MantineProviderBase>
    );
};

export default MantineProvider;
