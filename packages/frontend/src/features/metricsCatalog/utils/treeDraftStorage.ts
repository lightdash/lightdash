import { useLocalStorage } from '@mantine-8/hooks';
import { useCallback } from 'react';

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

export const useTreeDraft = (treeUuid: string | null) => {
    const [, setDraft, removeDraft] = useLocalStorage<TreeDraft | null>({
        key: `${DRAFT_KEY_PREFIX}${treeUuid ?? '__none__'}`,
        defaultValue: null,
    });

    const saveDraft = useCallback(
        (draft: TreeDraft) => {
            if (!treeUuid) return;
            setDraft(draft);
        },
        [treeUuid, setDraft],
    );

    const clearDraft = useCallback(() => {
        if (!treeUuid) return;
        removeDraft();
    }, [treeUuid, removeDraft]);

    return { saveDraft, clearDraft };
};
