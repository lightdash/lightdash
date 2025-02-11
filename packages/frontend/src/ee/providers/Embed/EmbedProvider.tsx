import { type FC } from 'react';
import AppProviderContext from './context';

type Props = {
    embedToken?: string;
};

const EmbedProvider: FC<React.PropsWithChildren<Props>> = ({
    children,
    embedToken = window.location.hash.replace('#', ''),
}) => {
    return (
        <AppProviderContext.Provider value={{ embedToken }}>
            {children}
        </AppProviderContext.Provider>
    );
};

export default EmbedProvider;
