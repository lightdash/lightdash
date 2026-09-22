import { AiAgentValidatorError, type Explore } from '@lightdash/common';

export class AiAgentUnknownFieldsError extends AiAgentValidatorError {
    readonly conciseMessage: string;

    constructor(
        message: string,
        readonly explore: Explore,
        readonly fieldIds: string[],
        readonly expectedEntityType: 'dimension' | 'metric' | null = null,
    ) {
        super(message);
        const type = expectedEntityType ? `${expectedEntityType} ` : '';
        const ids = [...new Set(fieldIds)]
            .slice(0, 8)
            .map((fieldId) => JSON.stringify(fieldId))
            .join(', ');
        this.conciseMessage = `Unknown or incompatible ${type}IDs in explore ${JSON.stringify(explore.name)}: ${ids}.`;
    }
}
