import { type ExternalConnection } from '@lightdash/common';

export type DataAppConnectionIdentity = Pick<
    ExternalConnection,
    'externalConnectionUuid' | 'name' | 'slug'
>;

/** A connection slug resolved for linking to a data app. */
export type ConnectionSlugLookup =
    | {
          slug: string;
          status: 'found';
          connection: DataAppConnectionIdentity;
      }
    | { slug: string; status: 'not_found' }
    | { slug: string; status: 'not_linkable' };
