/** Mirrors LEARN_ASK_QUERY_MAX_LENGTH in @lightdash/common (parity-tested). */
export const ASK_QUERY_MAX_LENGTH = 500;

export type LearnAskMatch = {
    courseId: string;
    lessonId: string | null;
    title: string;
    score: number;
};

export type LearnBadgeTier = 'bronze' | 'silver' | 'gold' | 'violet';
