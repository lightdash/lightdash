import { Paper } from '@mantine/core';
import { useRef, type FC, type ReactNode } from 'react';
import classes from './ControlSidebar.module.css';
import { useRailContractClasses } from './railContractClasses';
import { useRailTop } from './useRailTop';

// The rail: a card next to the grid, stuck under the tabs and filter bar. Its
// content is keyed by the edited filter; the card itself stays
export const EditorShell: FC<{ children: ReactNode }> = ({ children }) => {
    const ref = useRef<HTMLDivElement>(null);
    useRailTop(ref);
    const contractClasses = useRailContractClasses();
    return (
        <Paper
            ref={ref}
            className={
                contractClasses
                    ? `${contractClasses.rail} ${classes.root}`
                    : classes.root
            }
            data-controls-editor
        >
            {children}
        </Paper>
    );
};
