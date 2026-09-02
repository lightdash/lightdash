export type LearnQuizQuestion = {
    id: string;
    prompt: string;
    choices: string[];
    answer: number;
    /** Lesson stem the question belongs to; absent on legacy quizzes. */
    lesson?: string;
};

export type LearnLesson = {
    id: string;
    title: string;
    html: string;
    scope: string | null;
};

export type LearnDemoHotspot = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type LearnDemoStep = {
    image: string;
    caption: string;
    hotspot: LearnDemoHotspot | null;
};

export type LearnDemo = {
    id: string;
    title: string;
    viewport: { width: number; height: number };
    steps: LearnDemoStep[];
};

export type LearnCourse = {
    id: string;
    title: string;
    passingScore: number;
    logo?: string;
    lessons: LearnLesson[];
    quiz: { questions: LearnQuizQuestion[] };
    demos: Record<string, LearnDemo>;
    version: number;
    contentHash: string;
    publishedAt: string;
    assetBaseUrl: string;
};
