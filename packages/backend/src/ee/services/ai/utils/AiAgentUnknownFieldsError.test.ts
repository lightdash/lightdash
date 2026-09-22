import { validExplore } from '../../../../services/ProjectService/ProjectService.mock';
import { AiAgentUnknownFieldsError } from './AiAgentUnknownFieldsError';

describe('AiAgentUnknownFieldsError', () => {
    it('builds compact model guidance from structured fields, independent of display prose', () => {
        const error = new AiAgentUnknownFieldsError(
            'Localized validator prose without inventory delimiters',
            validExplore,
            ['missing_metric', 'missing_metric', 'missing_dimension'],
            'metric',
        );

        expect(error.conciseMessage).toBe(
            'Unknown or incompatible metric IDs in explore "valid_explore": "missing_metric", "missing_dimension".',
        );
        expect(error.conciseMessage).not.toContain(error.message);
    });
});
