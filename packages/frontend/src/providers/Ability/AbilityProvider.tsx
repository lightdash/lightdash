import { type FC } from 'react';
import { defaultAbility } from './constants';
import { AbilityContext } from './context';

const AbilityProvider: FC<React.PropsWithChildren> = ({ children }) => {
    console.log('trigger e2e tests');
    return (
        <AbilityContext.Provider value={defaultAbility}>
            {children}
        </AbilityContext.Provider>
    );
};

export default AbilityProvider;
