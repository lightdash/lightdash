import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import useToaster from '../../../hooks/toaster/useToaster';
import { roadmapApi } from './roadmapApi';
export function useFollowRoadmapProject(cacheKey: string) {
    const queryClient = useQueryClient();
    const { showToastError, showToastSuccess } = useToaster();
    const inFlight = useRef(new Set<string>());
    const [pendingProjectIds, setPendingProjectIds] = useState<string[]>([]);
    const [submittedProjectIds, setSubmittedProjectIds] = useState<string[]>(
        [],
    );
    const { mutateAsync } = useMutation({
        mutationFn: roadmapApi.followProject,
        retry: false,
        onSuccess: ({ message }, { projectId }) => {
            setSubmittedProjectIds((ids) => [...new Set([...ids, projectId])]);
            showToastSuccess({ title: 'Request sent', subtitle: message });
            void queryClient.invalidateQueries({
                queryKey: ['roadmap-projects', cacheKey],
            });
        },
    });

    const follow = async (
        interest: Parameters<typeof roadmapApi.followProject>[0],
    ): Promise<boolean> => {
        const { projectId } = interest;
        if (inFlight.current.has(projectId)) return false;
        inFlight.current.add(projectId);
        setPendingProjectIds([...inFlight.current]);
        try {
            await mutateAsync(interest);
            return true;
        } catch {
            showToastError({
                title: 'Could not send request',
                subtitle: 'Your note has been kept. Please try again.',
            });
            return false;
        } finally {
            inFlight.current.delete(projectId);
            setPendingProjectIds([...inFlight.current]);
        }
    };

    return { follow, submittedProjectIds, pendingProjectIds };
}
