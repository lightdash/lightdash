import { assertUnreachable } from '@lightdash/common';
import {
    REQUEST_AUTHORITY,
    type ComposerAuthority,
    type QueryRunAuthority,
    type RequestAuthority,
} from '../../AsyncQueryService/types';

/** SQL, python, duckdb and merge nodes run unbound under a Document or merged chart, which vouch only for their semantic-layer queries. */
export const withoutDocumentAuthority = (
    authority: QueryRunAuthority,
): RequestAuthority | ComposerAuthority => {
    switch (authority.kind) {
        case 'request':
        case 'composer':
            return authority;
        case 'document':
        case 'mergedChart':
            return REQUEST_AUTHORITY;
        default:
            return assertUnreachable(authority, 'Unknown query authority');
    }
};
