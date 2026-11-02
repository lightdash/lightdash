import {
    getIdTokenSubject,
    type GoogleIdentityTokenSource,
} from './googleIdentityTokenSource';

// A fixed audience used only to read this instance's subject.
const SUBJECT_LOOKUP_AUDIENCE = 'lightdash-subject-lookup';

export const createGoogleIdentitySubjectGetter = (
    tokenSource: GoogleIdentityTokenSource,
) => {
    let subject: Promise<string | undefined> | undefined;

    return async () => {
        subject ??= tokenSource
            .getIdToken(SUBJECT_LOOKUP_AUDIENCE)
            .then(getIdTokenSubject)
            .catch(() => undefined);
        const resolved = await subject;
        // Retry a failed lookup next time.
        if (resolved === undefined) subject = undefined;
        return resolved;
    };
};
