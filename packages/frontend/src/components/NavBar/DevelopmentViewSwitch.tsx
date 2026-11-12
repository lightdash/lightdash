import { SegmentedControl, Tooltip } from '@mantine/core';
import { useDevelopmentView } from '../../features/semanticStudio/developmentView';
import classes from './DevelopmentViewSwitch.module.css';

const LIVE = 'Live';
const MINE = 'My changes';

/** Sits in the navbar while queries read the person's unpublished models, so a number is never mistaken for a live one. */
export const DevelopmentViewSwitch = () => {
    const [isOn, setIsOn] = useDevelopmentView();
    if (!isOn) return null;
    return (
        <Tooltip
            multiline
            w={260}
            label="You are viewing this project with your unpublished changes. Nobody else sees them, and charts and dashboards cannot be saved in this view."
        >
            <SegmentedControl
                size="xs"
                classNames={{
                    indicator: classes.indicator,
                    label: classes.label,
                }}
                aria-label="Which version of the project you are viewing"
                data={[LIVE, MINE]}
                value={MINE}
                onChange={(next) => {
                    if (next === LIVE) setIsOn(false);
                }}
            />
        </Tooltip>
    );
};
