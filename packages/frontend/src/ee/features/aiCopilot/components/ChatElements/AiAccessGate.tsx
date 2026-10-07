import { type AiAccessRefusal } from '@lightdash/common';
import { Box } from '@mantine/core';
import { type ReactNode } from 'react';
import { AiAccessCallout } from './AiAccessCallout';
import styles from './AiAccessGate.module.css';

export const AiAccessGate = ({
    projectUuid,
    refusal,
    variant,
    children,
}: {
    projectUuid: string | undefined;
    refusal: AiAccessRefusal | null | undefined;
    variant: 'card' | 'inline';
    children: ReactNode;
}) => (
    <>
        {projectUuid && refusal && (
            <AiAccessCallout
                projectUuid={projectUuid}
                refusal={refusal}
                variant={variant}
            />
        )}
        <Box
            component="fieldset"
            disabled={!!refusal}
            className={styles.composerArea}
            data-access-refused={!!refusal}
        >
            {children}
        </Box>
    </>
);
