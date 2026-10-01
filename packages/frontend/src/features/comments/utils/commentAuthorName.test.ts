import { describe, expect, it } from 'vitest';
import {
    getCommentAuthorName,
    UNNAMED_COMMENT_AUTHOR,
} from './commentAuthorName';

describe('getCommentAuthorName', () => {
    it('keeps a real name', () => {
        expect(getCommentAuthorName('Alex Smith')).toBe('Alex Smith');
    });

    it('labels an author who has no name', () => {
        expect(getCommentAuthorName(' ')).toBe(UNNAMED_COMMENT_AUTHOR);
    });
});
