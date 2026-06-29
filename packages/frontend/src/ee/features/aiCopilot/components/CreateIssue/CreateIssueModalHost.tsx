import { type FC } from 'react';
import { closeCreateIssue } from '../../store/createIssueSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import { CreateIssueModal } from './CreateIssueModal';

/**
 * Always-mounted host for the create-issue modal so any content entry point
 * (dashboard / tile / chart) can open it via the `createIssue` store slice,
 * without each call site owning the modal.
 */
export const CreateIssueModalHost: FC = () => {
    const dispatch = useAiAgentStoreDispatch();
    const { open, context } = useAiAgentStoreSelector(
        (state) => state.createIssue,
    );

    return (
        <CreateIssueModal
            opened={open}
            context={context}
            onClose={() => dispatch(closeCreateIssue())}
        />
    );
};
