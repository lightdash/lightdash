import { useIsMutating } from '@tanstack/react-query';

/** A clean editor is a valid result; an unsaved or still-saving chart is not. */
export const useVerifiedChartSavePending = (
    chartUuid: string | undefined,
    hasUnsavedChanges: boolean,
): boolean => {
    const saving = useIsMutating({
        mutationKey: ['saved_query_version'],
        predicate: (mutation) => {
            const variables: unknown = mutation.state.variables;
            return (
                !!chartUuid &&
                typeof variables === 'object' &&
                variables !== null &&
                'uuid' in variables &&
                variables.uuid === chartUuid
            );
        },
    });
    return hasUnsavedChanges || saving > 0;
};
