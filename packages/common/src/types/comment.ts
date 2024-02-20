export type Comment = {
    commentId: string;
    text: string;
    createdAt: Date;
    user: {
        name: string;
    };
    replyTo: string | undefined;
    replies?: Comment[];
    resolved: boolean;
    canRemove: boolean;
};

export type ApiCommentsResults = Comment[];
