import { MobileSetupCodeError } from '@lightdash/common';

export class MobileSetupRejection extends Error {
    readonly code: MobileSetupCodeError;

    constructor(code: MobileSetupCodeError) {
        super(code);
        this.code = code;
    }
}
