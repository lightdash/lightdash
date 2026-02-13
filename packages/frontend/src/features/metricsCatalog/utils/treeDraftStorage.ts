type TreeDraft = {
    nodes: Array<{
        catalogSearchUuid: string;
        xPosition: number;
        yPosition: number;
    }>;
    edges: Array<{
        sourceCatalogSearchUuid: string;
        targetCatalogSearchUuid: string;
    }>;
    name: string;
    description: string;
    savedAt: number;
    /** The tree generation when the draft was created. Used to detect concurrent edits. */
    generation: number;
};

const DRAFT_KEY_PREFIX = 'lightdash-tree-draft-';

const getDraftKey = (treeUuid: string) => `${DRAFT_KEY_PREFIX}${treeUuid}`;

export const saveDraft = (treeUuid: string, draft: TreeDraft): void => {
    try {
        localStorage.setItem(getDraftKey(treeUuid), JSON.stringify(draft));
    } catch {
        // localStorage may be full or unavailable — silently ignore
    }
};

export const clearDraft = (treeUuid: string): void => {
    try {
        localStorage.removeItem(getDraftKey(treeUuid));
    } catch {
        // silently ignore
    }
};
