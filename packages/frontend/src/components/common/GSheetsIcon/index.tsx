import { type TablerIconsProps } from '@tabler/icons-react';
import clsx from 'clsx';
import { forwardRef } from 'react';
import GsheetsFilledSvg from '../../../svgs/google-sheets-filled.svg?react';
import GsheetsSvg from '../../../svgs/google-sheets.svg?react';
import classes from './GSheetsIcon.module.css';

export const GSheetsIcon = forwardRef<SVGSVGElement, TablerIconsProps>(
    (props, ref) => {
        // Convert numeric stroke values to strings
        const svgProps = {
            ...props,
            stroke: props.stroke?.toString(),
            strokeWidth: props.strokeWidth?.toString(),
        };

        return (
            <GsheetsSvg
                {...svgProps}
                ref={ref}
                className={clsx(classes.icon, props.className)}
            />
        );
    },
);

export const GSheetsIconFilled = forwardRef<SVGSVGElement, TablerIconsProps>(
    (props, ref) => {
        // Convert numeric stroke values to strings
        const svgProps = {
            ...props,
            stroke: props.stroke?.toString(),
            strokeWidth: props.strokeWidth?.toString(),
        };

        return (
            <GsheetsFilledSvg
                {...svgProps}
                ref={ref}
                className={clsx(classes.icon, props.className)}
            />
        );
    },
);

// Add display names for better debugging
GSheetsIcon.displayName = 'GSheetsIcon';
GSheetsIconFilled.displayName = 'GSheetsIconFilled';
