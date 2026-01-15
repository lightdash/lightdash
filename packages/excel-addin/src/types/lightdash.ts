export type ExploreField = {
    name: string;
    label?: string;
    type?: string;
};

export type ExploreTable = {
    dimensions?: ExploreField[];
    metrics?: ExploreField[];
    timeDimensions?: ExploreField[];
};

export type Explore = {
    tables?: Record<string, ExploreTable>;
};
