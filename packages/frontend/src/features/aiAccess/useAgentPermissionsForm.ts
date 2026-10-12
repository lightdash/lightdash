import {
    type AgentCapabilityPolicy,
    type AgentCapabilityPolicyOverview,
} from '@lightdash/common';
import { useForm } from '@mantine/form';
import { useState } from 'react';
import {
    countAgentPermissionChanges,
    draftToPolicyRequest,
    getAgentPermissionChanges,
    getAgentPermissionChoice,
    policyToDraft,
} from './agentPermissionDraft';
import {
    useSaveAgentCapabilityCeiling,
    type useAgentCapabilityPolicy,
} from './api';

export const useAgentPermissionsForm = ({
    policy,
    refetchPolicy,
    loadError,
}: {
    policy: AgentCapabilityPolicyOverview;
    refetchPolicy: ReturnType<typeof useAgentCapabilityPolicy>['refetch'];
    loadError: boolean;
}) => {
    const [baseline, setBaseline] = useState(() => policyToDraft(policy));
    const form = useForm({ initialValues: baseline });
    const [choice, setChoice] = useState(() =>
        getAgentPermissionChoice(baseline),
    );
    const [reviewOpened, setReviewOpened] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [conflictVersion, setConflictVersion] = useState<number | null>(null);
    const changes = getAgentPermissionChanges(baseline, form.values);
    const count = countAgentPermissionChanges(changes);
    const accept = (updated: AgentCapabilityPolicy) => {
        const next = policyToDraft(updated);
        setBaseline(next);
        setChoice(getAgentPermissionChoice(next));
        form.setValues(next);
        form.resetDirty(next);
        setReviewOpened(false);
        setConflictVersion(null);
        setSaveError(null);
    };
    if (count === 0 && policy.version > baseline.version) accept(policy);
    const save = useSaveAgentCapabilityCeiling(accept);
    const saving = save.isLoading || refreshing;
    const conflict =
        count > 0 &&
        !save.isLoading &&
        (policy.version > baseline.version || conflictVersion !== null);
    const disabled = saving || conflict;
    const invalidGroups =
        form.values.allowedGroupUuids?.length === 0 &&
        baseline.allowedGroupUuids?.length !== 0;
    const saveDisabled = disabled || loadError || invalidGroups || count === 0;
    const reload = async () => {
        setRefreshing(true);
        try {
            const latest = await refetchPolicy();
            if (latest.data && !latest.isError) accept(latest.data);
            else setSaveError('Could not reload agent permissions.');
        } finally {
            setRefreshing(false);
        }
    };
    const submit = () => {
        if (saveDisabled) return;
        setSaveError(null);
        save.mutate(draftToPolicyRequest(baseline, form.values), {
            onError: async () => {
                setSaveError('Could not save agent permissions.');
                setRefreshing(true);
                try {
                    const latest = await refetchPolicy();
                    if (latest.data && latest.data.version > baseline.version) {
                        setConflictVersion(latest.data.version);
                        setReviewOpened(false);
                    }
                } finally {
                    setRefreshing(false);
                }
            },
        });
    };

    return {
        baseline,
        form,
        choice,
        setChoice,
        reviewOpened,
        setReviewOpened,
        changes,
        count,
        accept,
        saving,
        conflict,
        disabled,
        invalidGroups,
        saveDisabled,
        saveError,
        reload,
        submit,
    };
};
