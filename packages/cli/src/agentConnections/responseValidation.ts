import { ParameterError } from '@lightdash/common';
import { getAgentConnectionSelection } from '../credentials';

export const assertConnectionResponse = (valid: boolean): void => {
    if (getAgentConnectionSelection() !== null && !valid)
        throw new ParameterError('The server returned an invalid response.');
};

export const isResponseCount = (value: unknown): boolean =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
