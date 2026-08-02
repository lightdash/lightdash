import { type UserAvatarColorValue } from './userAvatars';

export type Comment = {
    commentId: string;
    text: string;
    textHtml: string;
    createdAt: Date;
    user: {
        name: string;
        userUuid: string;
        avatarUrl: string | null;
        avatarGradient: UserAvatarColorValue | null;
    };
    replyTo: string | undefined;
    replies?: Comment[];
    resolved: boolean;
    canRemove: boolean;
    mentions: string[];
};
