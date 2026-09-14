import { type ContentType } from './content';

export type ContentSlugRenameRequest = {
    resourceType: ContentType;
    from: string;
    to: string;
};
