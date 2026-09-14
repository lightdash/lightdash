import { type FC, type PropsWithChildren } from 'react';
import MantineBaseProvider from '../../providers/MantineBaseProvider';

/**
 * The navbar renders inside a forced-dark provider, but modals opened from it
 * portal onto the page. Re-anchor them to the app's real color scheme so
 * JS-resolved component colors (e.g. filled Button text) match the page.
 */
const AppColorSchemeScope: FC<PropsWithChildren> = ({ children }) => (
    <MantineBaseProvider withCssVariables={false}>
        {children}
    </MantineBaseProvider>
);

export default AppColorSchemeScope;
