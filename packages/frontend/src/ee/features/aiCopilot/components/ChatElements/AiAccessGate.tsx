import { type AiAccessRefusal } from '@lightdash/common';
import { Box } from '@mantine/core';
import { type ReactNode } from 'react';
import { AiAccessCallout } from './AiAccessCallout';

export const AiAccessGate = ({
    projectUuid,
    refusal,
    isLoading,
    variant,
    children,
}: {
    projectUuid: string | undefined;
    refusal: AiAccessRefusal | null | undefined;
    isLoading: boolean;
    variant: 'card' | 'inline';
    children: ReactNode;
}) => {
    if (isLoading) {
        return (
            <Box mih={160} data-testid="ai-access-placeholder" aria-hidden />
        );
    }

    if (projectUuid && refusal) {
        return (
            <AiAccessCallout
                projectUuid={projectUuid}
                refusal={refusal}
                variant={variant}
            />
        );
    }

    return <>{children}</>;
};
