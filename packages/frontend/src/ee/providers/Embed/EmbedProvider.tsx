import { useState, type FC } from 'react';
import AppProviderContext from './context';

const EmbedProvider: FC<React.PropsWithChildren<{}>> = ({ children }) => {
    const [embedToken] = useState(window.location.hash.replace('#', ''));
    return (
        <AppProviderContext.Provider value={{ embedToken }}>
            {children}
        </AppProviderContext.Provider>
    );
};

export default EmbedProvider;
