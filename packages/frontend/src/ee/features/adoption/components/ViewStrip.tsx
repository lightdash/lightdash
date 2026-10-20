import { Box } from '@mantine/core';
import { type FC, type ReactNode, type Ref } from 'react';
import mapStyles from '../map/AdoptionMap.module.css';

// How tall the view is drawn across the top while a department is selected below it
const STRIP_HEIGHT_PX = 280;

type Props = {
    // The view's name, which a screen reader reads when focus comes back to it
    label: string;
    // A department is selected: the view becomes a strip across the top, with the department below it
    isStrip: boolean;
    // Focus comes back here when the department is deselected
    ref: Ref<HTMLDivElement>;
    children: ReactNode;
};

// Holds the view the page shows: at full height with the organization panel beside it, or as a strip over the
// department selected. The views read the strip's height and leave out their panel
export const ViewStrip: FC<Props> = ({ label, isStrip, ref, children }) => (
    <Box
        ref={ref}
        role="region"
        aria-label={label}
        tabIndex={-1}
        className={mapStyles.view}
        data-strip={isStrip || undefined}
        __vars={
            isStrip
                ? { '--adoption-view-height': `${STRIP_HEIGHT_PX}px` }
                : undefined
        }
    >
        {children}
    </Box>
);
