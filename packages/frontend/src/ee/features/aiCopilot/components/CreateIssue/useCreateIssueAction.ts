import useApp from '../../../../../providers/App/useApp';
import { useAiAgentButtonVisibility } from '../../hooks/useAiAgentsButtonVisibility';
import { openCreateIssue } from '../../store/createIssueSlice';
import { useAiAgentStoreDispatch } from '../../store/hooks';

type Args = {
    projectUuid: string | undefined;
    chartUuid?: string;
    dashboardUuid?: string;
    tileUuid?: string;
};

/**
 * Shared logic for the "Create issue" entry points (dashboard / tile / chart):
 * resolves whether the action should be shown and opens the create-issue modal
 * pre-filled with the content's context on click. `canCreate` mirrors the
 * `POST /review-items` permission (org admin) plus AI agents being enabled, so
 * the affordance never 403s.
 */
export const useCreateIssueAction = ({
    projectUuid,
    chartUuid,
    dashboardUuid,
    tileUuid,
}: Args) => {
    const isAiEnabled = useAiAgentButtonVisibility();
    const { user } = useApp();
    const dispatch = useAiAgentStoreDispatch();

    const isOrgAdmin =
        user.data?.ability.can('manage', 'Organization') ?? false;
    const canCreate = isAiEnabled && isOrgAdmin && !!projectUuid;

    const handleClick = () => {
        if (!projectUuid) return;
        dispatch(
            openCreateIssue({
                projectUuid,
                chartUuid,
                dashboardUuid,
                tileUuid,
            }),
        );
    };

    return { canCreate, handleClick };
};
