import {
    Box,
    Group,
    Title,
    type BoxProps,
    type GroupProps,
    type TitleProps,
} from '@mantine/core';
import clsx from 'clsx';
import { type FC, type PropsWithChildren } from 'react';
import classes from './PageHeader.module.css';

export const HeaderMain: FC<PropsWithChildren<BoxProps>> = ({
    className,
    ...props
}) => <Box {...props} className={clsx(classes.main, className)} />;

export const HeaderBreadcrumbs: FC<PropsWithChildren<BoxProps>> = ({
    className,
    ...props
}) => <Box {...props} className={clsx(classes.breadcrumbs, className)} />;

export const HeaderTitle: FC<GroupProps> = ({ className, ...props }) => (
    <Group {...props} className={clsx(classes.title, className)} />
);

export const HeaderHeading: FC<TitleProps> = ({ className, ...props }) => (
    <Title {...props} className={clsx(classes.heading, className)} />
);

export const HeaderMetadata: FC<GroupProps> = ({ className, ...props }) => (
    <Group {...props} className={clsx(classes.metadata, className)} />
);

export const HeaderActions: FC<GroupProps> = ({ className, ...props }) => (
    <Group {...props} className={clsx(classes.actions, className)} />
);
