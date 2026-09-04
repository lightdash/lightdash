import { ManagedSignInError } from '@lightdash/common';

/**
 * Every managed sign-in failure the exchange returns. The code becomes the
 * OAuth `error_description`; `detail` is for the server log only and never
 * reaches the caller.
 */
export class ManagedSignInRejection extends Error {
    readonly code: ManagedSignInError;

    readonly detail: string | undefined;

    constructor(code: ManagedSignInError, detail?: string) {
        super(code);
        this.name = 'ManagedSignInRejection';
        this.code = code;
        this.detail = detail;
    }
}
