import { AiAgentValidatorError, type Explore } from '@lightdash/common';

export class AiAgentUnknownFieldsError extends AiAgentValidatorError {
    constructor(
        message: string,
        readonly explore: Explore,
        readonly fieldIds: string[],
        readonly expectedEntityType: 'dimension' | 'metric' | null = null,
    ) {
        super(message);
    }
}
