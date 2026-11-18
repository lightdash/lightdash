import {
    assertUnreachable,
    type ApiError,
    type SemanticStudioWorkspace,
    type SemanticStudioWorkspaces,
    type SemanticStudioWorkspaceStartBody,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { isDevelopmentViewOn } from './developmentView';
import {
    CHECKOUT_KEY,
    DRAFT_KEY,
    useCanEditSemanticLayer,
} from './useSemanticLayerModel';

export const WORKSPACES_KEY = 'semantic-studio-workspaces';
const toUrl = (projectUuid: string, path: string) =>
    `/projects/${projectUuid}/semantic-studio/workspaces${path}`;

/** Everyone's Studio work in this project, for those who can change it; refreshed now and then so others' work and merges show up. */
export const useStudioWorkspaces = (projectUuid: string | undefined) => {
    const lightdashApi = useLightdashApi();
    const canEdit = useCanEditSemanticLayer(projectUuid ?? '');
    return useQuery<SemanticStudioWorkspaces, ApiError>({
        queryKey: [WORKSPACES_KEY, projectUuid],
        queryFn: () =>
            lightdashApi<SemanticStudioWorkspaces>({
                url: toUrl(projectUuid ?? '', ''),
                method: 'GET',
                body: undefined,
            }),
        enabled: !!projectUuid && canEdit,
        refetchInterval: 60_000,
        // Without the workspace list Studio still works on the open chat alone.
        retry: false,
    });
};

/** The workspace your chat writes to, or null when you have none open. */
export const useActiveStudioWorkspace = (
    projectUuid: string | undefined,
): SemanticStudioWorkspace | null =>
    useStudioWorkspaces(projectUuid).data?.mine.find(
        ({ isActive }) => isActive,
    ) ?? null;

type Action =
    | { kind: 'start'; body: SemanticStudioWorkspaceStartBody }
    | { kind: 'activate'; workspaceUuid: string }
    | { kind: 'leave' }
    | { kind: 'finish'; workspaceUuid: string }
    | { kind: 'rename'; workspaceUuid: string; name: string };

const toRequest = (
    action: Action,
): { path: string; method: 'POST' | 'PATCH'; body: string | undefined } => {
    switch (action.kind) {
        case 'start':
            return {
                path: '',
                method: 'POST',
                body: JSON.stringify(action.body),
            };
        case 'activate':
            return {
                path: `/${action.workspaceUuid}/activate`,
                method: 'POST',
                body: undefined,
            };
        case 'leave':
            return { path: '/leave', method: 'POST', body: undefined };
        case 'finish':
            return {
                path: `/${action.workspaceUuid}/finish`,
                method: 'POST',
                body: undefined,
            };
        case 'rename':
            return {
                path: `/${action.workspaceUuid}`,
                method: 'PATCH',
                body: JSON.stringify({ name: action.name }),
            };
        default:
            return assertUnreachable(action, 'Unknown workspace action');
    }
};

/** Starts, switches, leaves, finishes or renames a workspace, then reads the list again. */
export const useStudioWorkspaceAction = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    return useMutation<SemanticStudioWorkspace | undefined, ApiError, Action>({
        mutationFn: (action) => {
            const { path, method, body } = toRequest(action);
            return lightdashApi<SemanticStudioWorkspace | undefined>({
                url: toUrl(projectUuid, path),
                method,
                body,
            });
        },
        onSuccess: () =>
            Promise.all([
                queryClient.invalidateQueries([WORKSPACES_KEY, projectUuid]),
                // The draft shown is the active workspace's.
                queryClient.invalidateQueries([DRAFT_KEY, projectUuid]),
                // The rest of the app shows the checked-out change.
                queryClient.invalidateQueries([CHECKOUT_KEY, projectUuid]),
                // Explores read the active workspace's changes while the development view is on.
                ...(isDevelopmentViewOn()
                    ? [queryClient.invalidateQueries(['tables'])]
                    : []),
            ]),
    });
};
