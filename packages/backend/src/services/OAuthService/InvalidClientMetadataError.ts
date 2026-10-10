import { ParameterError } from '@lightdash/common';

export class InvalidClientMetadataError extends ParameterError {
    constructor() {
        super('Client metadata is invalid');
    }
}
