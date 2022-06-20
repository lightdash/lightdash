import {Ability} from '@casl/ability';
import {createContextualCan} from '@casl/react';
import {createContext} from 'react';

export const AbilityContext = createContext(new Ability());
export const Can = createContextualCan(AbilityContext.Consumer);
