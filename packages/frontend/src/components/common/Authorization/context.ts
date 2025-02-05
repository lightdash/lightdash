import { Ability } from '@casl/ability';
import { type PossibleAbilities } from '@lightdash/common';
import { createContext } from 'react';

export const AbilityContext = createContext(new Ability<PossibleAbilities>());
