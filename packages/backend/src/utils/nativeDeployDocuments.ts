import {
    attachNativeMaterializationDocument,
    ForbiddenError,
    getNativeMaterializationDocument,
    isExploreError,
    ParameterError,
    type Explore,
    type ExploreError,
} from '@lightdash/common';

export function attachDeployDocuments(
    explores: (Explore | ExploreError)[],
    documents: unknown,
) {
    if (documents === undefined) return;
    if (!Array.isArray(documents) || documents.length !== explores.length)
        throw new ParameterError(
            'Native model documents must match the deployed explores.',
        );
    explores.forEach((explore, index) => {
        const document: unknown = documents[index];
        if (document === null) return;
        if (
            typeof document !== 'object' ||
            !('name' in document) ||
            typeof document.name !== 'string' ||
            !('content' in document) ||
            !(
                typeof document.content === 'string' ||
                document.content === null
            ) ||
            isExploreError(explore) ||
            document.name !==
                (explore.tables[explore.baseTable]?.originalName ??
                    explore.baseTable)
        ) {
            throw new ParameterError(
                'Native model document must match its deployed base model.',
            );
        }
        attachNativeMaterializationDocument(explore, {
            name: document.name,
            content: document.content,
        });
    });
}

export function assertAgentDeployDocuments(
    explores: (Explore | ExploreError)[],
) {
    if (
        explores.some(
            (explore) =>
                getNativeMaterializationDocument(explore)?.content != null,
        )
    )
        throw new ForbiddenError(
            'Agent connections cannot deploy materialized models.',
        );
}
