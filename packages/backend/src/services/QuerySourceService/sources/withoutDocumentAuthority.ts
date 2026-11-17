import { assertUnreachable } from '@lightdash/common';
import {
    REQUEST_AUTHORITY,
    type ComposerAuthority,
    type QueryRunAuthority,
    type RequestAuthority,
} from '../../AsyncQueryService/types';

/** SQL, python, duckdb and merge nodes run unbound under a Document, which vouches only for its own queries. */
export const withoutDocumentAuthority = (
    authority: QueryRunAuthority,
): RequestAuthority | ComposerAuthority => {
    switch (authority.kind) {
        case 'request':
        case 'composer':
            return authority;
        case 'document':
            return REQUEST_AUTHORITY;
        default:
            return assertUnreachable(authority, 'Unknown query authority');
    }
};
