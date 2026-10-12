import { type AgentConnectionApprovalProject } from '@lightdash/common';
import { Anchor, Button, Stack, Text, Title } from '@mantine/core';
import { useRef, type MouseEvent } from 'react';
import { Link } from 'react-router';
import { AgentConnectionApprovalWarehouseStep } from './AgentConnectionApprovalWarehouseStep';
import { warehouseStepMessage } from './approvalSelection';

export type ApprovalCompletionState = {
    decision: 'approve' | 'deny';
    completionUrl: string;
    popup: Window | null;
    delivered: boolean;
    projects: AgentConnectionApprovalProject[];
    notice: string | null;
};

export const ApprovalCompletion = ({
    completion,
}: {
    completion: ApprovalCompletionState;
}) => {
    const delivered = useRef(completion.delivered);
    const returnToCli = (event: MouseEvent<HTMLAnchorElement>) => {
        if (delivered.current) {
            event.preventDefault();
            completion.popup?.focus();
        } else {
            delivered.current = true;
        }
    };
    return (
        <Stack>
            <Title order={2}>
                {completion.decision === 'approve'
                    ? 'Connect your warehouses'
                    : 'Approval cancelled'}
            </Title>
            <Text>
                {completion.decision === 'approve'
                    ? warehouseStepMessage(completion.notice)
                    : 'No connection was created.'}
            </Text>
            <Anchor
                href={completion.completionUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={returnToCli}
            >
                Return to the CLI
            </Anchor>
            {completion.decision === 'approve' && (
                <AgentConnectionApprovalWarehouseStep
                    projects={completion.projects}
                />
            )}
            {completion.decision === 'approve' && (
                <Button
                    component={Link}
                    to="/generalSettings/myAgentConnections"
                    variant="default"
                >
                    Do this later
                </Button>
            )}
        </Stack>
    );
};
