import { ManagedSignInError } from '@lightdash/common';

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
