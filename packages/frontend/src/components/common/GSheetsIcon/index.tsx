import { type TablerIconsProps } from '@tabler/icons-react';
import { forwardRef } from 'react';
import GsheetsFilledSvg from '../../../svgs/google-sheets-filled.svg?react';
import GsheetsSvg from '../../../svgs/google-sheets.svg?react';

const iconStyles = {
    width: '16px',
    height: '16px',
};

const filledIconStyles = {
    width: '16px',
    height: '16px',
    path: {
        strokeWidth: 4,
    },
};

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
                style={{ ...iconStyles, ...props.style }}
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
                style={{ ...filledIconStyles, ...props.style }}
            />
        );
    },
);

// Add display names for better debugging
GSheetsIcon.displayName = 'GSheetsIcon';
GSheetsIconFilled.displayName = 'GSheetsIconFilled';
