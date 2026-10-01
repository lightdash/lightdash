export const UNNAMED_COMMENT_AUTHOR = 'Unnamed user';

export const getCommentAuthorName = (name: string): string =>
    name.trim() || UNNAMED_COMMENT_AUTHOR;
