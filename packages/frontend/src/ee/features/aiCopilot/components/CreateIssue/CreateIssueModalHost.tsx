import { type FC } from 'react';
import { closeCreateIssue } from '../../store/createIssueSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import { CreateIssueModal } from './CreateIssueModal';

/**
 * App-wide host for the create-issue modal so any content entry point
 * (dashboard / tile / chart) can open it via the `createIssue` store slice,
 * without each call site owning the modal. The modal itself mounts only while
 * open so its queries (projects, admin agents) never fire for users who don't
 * use it, and each open starts from freshly-seeded form state.
 */
export const CreateIssueModalHost: FC = () => {
    const dispatch = useAiAgentStoreDispatch();
    const { open, context } = useAiAgentStoreSelector(
        (state) => state.createIssue,
    );

    if (!open) return null;

    return (
        <CreateIssueModal
            opened
            context={context}
            onClose={() => dispatch(closeCreateIssue())}
        />
    );
};
