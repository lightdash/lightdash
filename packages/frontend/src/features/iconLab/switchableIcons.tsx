import { type IconProps } from '@tabler/icons-react';
import { forwardRef } from 'react';
import { type ContentIconName } from './contentIcons';
import { CONTENT_ICON_SETS } from './contentIconSets';
import { useContentIconSetKey } from './contentIconSetStore';

// Stand-ins for the Tabler content icons that follow the set picked in the icon lab.
const switchable = (name: ContentIconName) => {
    const SwitchableIcon = forwardRef<SVGSVGElement, IconProps>(
        (props, ref) => {
            const setKey = useContentIconSetKey();
            const Icon = CONTENT_ICON_SETS[setKey][name];
            return <Icon {...props} ref={ref} />;
        },
    );
    SwitchableIcon.displayName = `Switchable(${name})`;
    return SwitchableIcon;
};

export const IconLayoutDashboard = switchable('dashboard');
export const IconFolder = switchable('space');
export const IconAppWindow = switchable('dataApp');
export const IconFileText = switchable('document');
export const IconTable = switchable('table');
export const IconChartBar = switchable('bar');
export const IconChartLine = switchable('line');
export const IconChartArea = switchable('area');
export const IconChartAreaLine = switchable('mixed');
export const IconChartDots = switchable('scatter');
export const IconChartPie = switchable('pie');
export const IconSquareNumber1 = switchable('bigNumber');
export const IconFilter = switchable('funnel');
export const IconChartTreemap = switchable('treemap');
export const IconGauge = switchable('gauge');
export const IconMap = switchable('map');
export const IconGitMerge = switchable('sankey');
export const IconCode = switchable('custom');
export const IconPuzzle = switchable('dataAppViz');
