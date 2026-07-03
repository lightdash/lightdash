import { type AppSdkColorScheme } from '@lightdash/common';
import { useMantineColorScheme } from '@mantine/core';
import { useState } from 'react';

/**
 * Host color scheme captured once at mount, for the iframe URL-hash `theme=`
 * param. Frozen so the iframe src stays stable across toggles — live scheme
 * changes ride the SDK bridge's theme push, not the URL.
 */
export const useInitialColorScheme = (): AppSdkColorScheme => {
    const { colorScheme } = useMantineColorScheme();
    const [initialColorScheme] = useState<AppSdkColorScheme>(colorScheme);
    return initialColorScheme;
};
