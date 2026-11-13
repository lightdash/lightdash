import { assertUnreachable } from '@lightdash/common';
import {
    REQUEST_AUTHORITY,
    type ComposerAuthority,
    type QueryRunAuthority,
    type RequestAuthority,
} from '../../AsyncQueryService/types';

/** The authority a SQL, python, duckdb or merge node runs under. */
export const getNodeAuthority = (
    authority: QueryRunAuthority,
): RequestAuthority | ComposerAuthority => {
    switch (authority.kind) {
        case 'request':
        case 'composer':
            return authority;
        case 'document':
            // A Document vouches only for its own semantic and merge queries
            return REQUEST_AUTHORITY;
        default:
            return assertUnreachable(authority, 'Unknown query authority');
    }
};
