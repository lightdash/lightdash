export type ConceptLesson = {
    title: string;
    coveredScopes: string[];
    sections: {
        heading: string;
        body: string;
        sourceUrl: string;
        sourceLabel: string;
        sourceHash: string;
    }[];
};

export const conceptProgressKey = (scope: string): string => `concept:${scope}`;
