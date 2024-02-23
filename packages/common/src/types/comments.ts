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
    mentions: string[]; // list of user uuids mentioned in comments
};

export type ApiCommentsResults = Record<string, Comment[]>;
