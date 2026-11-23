import {
    assertUnreachable,
    type ApiError,
    type SemanticStudioWorkspace,
    type SemanticStudioWorkspaces,
    type SemanticStudioWorkspaceStartBody,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { invalidateStudio, WORKSPACES_KEY } from './studioQueryKeys';
import { useCanEditSemanticLayer } from './useSemanticLayerModel';

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
export const findActiveWorkspace = (
    workspaces: SemanticStudioWorkspaces | undefined,
): SemanticStudioWorkspace | null =>
    workspaces?.mine.find(({ isActive }) => isActive) ?? null;

/** Your workspace for this chat thread, among the ones given. */
export const findThreadWorkspace = (
    workspaces: SemanticStudioWorkspace[],
    threadUuid: string | null,
): SemanticStudioWorkspace | null =>
    threadUuid === null
        ? null
        : (workspaces.find(
              (workspace) =>
                  workspace.isMine && workspace.threadUuid === threadUuid,
          ) ?? null);

export const useActiveStudioWorkspace = (
    projectUuid: string | undefined,
): SemanticStudioWorkspace | null =>
    findActiveWorkspace(useStudioWorkspaces(projectUuid).data);

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
        // The draft shown and the rest of the app follow the checked-out change.
        onSuccess: () =>
            invalidateStudio(queryClient, projectUuid, {
                draft: true,
                draftState: false,
                checkout: true,
                liveModels: false,
                sources: false,
                pullRequestChecks: null,
            }),
    });
};
