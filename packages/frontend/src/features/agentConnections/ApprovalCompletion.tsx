import { type AgentConnectionApprovalProject } from '@lightdash/common';
import { Button, Stack, Text, Title } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { AgentConnectionApprovalWarehouseStep } from './AgentConnectionApprovalWarehouseStep';
import { warehouseStepCopy } from './approvalSelection';
import { openCompletionTab, navigateCompletionTab } from './completionDelivery';

export type ApprovalCompletionState = {
    decision: 'approve' | 'deny';
    completionUrl: string;
    attempted: boolean;
    projects: AgentConnectionApprovalProject[];
    notice: string | null;
};

export const ApprovalCompletion = ({
    completion,
}: {
    completion: ApprovalCompletionState;
}) => {
    const [fallbackAttempted, setFallbackAttempted] = useState(false);
    const attempted = completion.attempted || fallbackAttempted;
    const attempting = useRef(false);
    const heading = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        heading.current?.focus();
    }, []);
    const returnToCli = () => {
        if (attempting.current) return;
        const popup = openCompletionTab();
        if (!popup) return;
        if (!navigateCompletionTab(popup, completion.completionUrl)) return;
        attempting.current = true;
        setFallbackAttempted(true);
        heading.current?.focus();
    };
    return (
        <Stack>
            <Title order={3} ref={heading} tabIndex={-1}>
                {completion.decision === 'approve'
                    ? warehouseStepCopy.heading
                    : warehouseStepCopy.cancelledHeading}
            </Title>
            {completion.decision === 'deny' && (
                <Text>{warehouseStepCopy.cancelledMessage}</Text>
            )}
            {attempted ? (
                <Text size="sm" c="dimmed">
                    {warehouseStepCopy.nextStep}
                </Text>
            ) : (
                <Button variant="subtle" onClick={returnToCli}>
                    {warehouseStepCopy.returnToCli}
                </Button>
            )}
            {completion.decision === 'approve' && (
                <AgentConnectionApprovalWarehouseStep
                    projects={completion.projects}
                    notice={completion.notice}
                />
            )}
        </Stack>
    );
};
