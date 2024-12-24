import { createContextualCan } from '@casl/react';
import { AbilityContext } from './context';

export const Can = createContextualCan(AbilityContext.Consumer);
