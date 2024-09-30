export type Comment = {
    commentId: string;
    text: string;
    textHtml: string;
    createdAt: Date;
    user: {
        name: string;
    };
    replyTo: string | undefined;
    replies?: Comment[];
    resolved: boolean;
    canRemove: boolean;
    mentions: string[];
};
