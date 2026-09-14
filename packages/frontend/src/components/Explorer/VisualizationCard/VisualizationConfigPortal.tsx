import { Stack } from '@mantine/core';
import { type FC } from 'react';
import { VisualizationConfigPortalId } from '../ExplorePanel/constants';
import classes from './VisualizationConfigPortal.module.css';

type Props = {
    active?: boolean;
};

const VisualizationConfigPortal: FC<Props> = ({ active = true }) => (
    <Stack
        id={VisualizationConfigPortalId}
        className={classes.portal}
        data-active={active}
    />
);

export default VisualizationConfigPortal;
