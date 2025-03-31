import { type FC } from 'react';
import { defaultAbility } from './constants';
import { AbilityContext } from './context';

const AbilityProvider: FC<React.PropsWithChildren> = ({ children }) => {
    return (
        <AbilityContext.Provider value={defaultAbility}>
            {children}
        </AbilityContext.Provider>
    );
};

export default AbilityProvider;
