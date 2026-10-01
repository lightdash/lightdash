import { type NamePromptTrigger } from '../../providers/Tracking/types';

export const isNameMissing = (user: {
    firstName: string;
    lastName: string;
}): boolean => !user.firstName.trim() || !user.lastName.trim();

export const NAME_PROMPT_REASONS: Record<NamePromptTrigger, string> = {
    invite: 'The person you invite will see who invited them.',
    share_space: 'The people you share with will see who shared it.',
    comment: 'Your colleagues will see who wrote the comment.',
};

const getSkipKey = (userUuid: string) => `name-prompt-skipped:${userUuid}`;

export const hasSkippedNamePrompt = (
    storage: Pick<Storage, 'getItem'>,
    userUuid: string,
): boolean => storage.getItem(getSkipKey(userUuid)) === 'true';

export const rememberNamePromptSkipped = (
    storage: Pick<Storage, 'setItem'>,
    userUuid: string,
): void => storage.setItem(getSkipKey(userUuid), 'true');
