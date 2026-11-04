import { Tooltip } from '@mantine/core';
import { type ReactNode } from 'react';
import { MANAGED_BY_CODE_LABEL } from '../utils/gitBackedDocument';

type Props = {
    managed: boolean;
    label?: string;
    children: ReactNode;
};

/** Wraps an action that a Git-backed document refuses, explaining why on hover. */
export const GitBackedActionTooltip = ({ managed, label, children }: Props) => (
    <Tooltip
        label={managed ? MANAGED_BY_CODE_LABEL : label}
        disabled={!managed && label === undefined}
    >
        {children}
    </Tooltip>
);
