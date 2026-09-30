import { Box } from '@mantine/core';
import { type FC } from 'react';
import classes from './PixelStars.module.css';

const PixelStars: FC = () => <Box className={classes.stars} aria-hidden />;

export default PixelStars;
