import {
    AI_USER_THREAD_CREATED_FROM,
    type AiThreadCreatedFrom,
} from './requestTypes';

describe('thread origins', () => {
    it('keeps Semantic Studio threads out of the lists of chats a person sees in Ask AI', () => {
        const listed: readonly AiThreadCreatedFrom[] =
            AI_USER_THREAD_CREATED_FROM;
        expect(listed).not.toContain('semantic_studio');
    });
});
