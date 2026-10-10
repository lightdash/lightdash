import { ParameterError } from '@lightdash/common';

export class InvalidRedirectUriError extends ParameterError {
    constructor(uri: string) {
        const escapedUri = uri.replace(
            /[^\u0020-\u007e]/g,
            (character) =>
                `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
        );
        super(`Invalid redirect URI ${escapedUri}`);
    }
}
