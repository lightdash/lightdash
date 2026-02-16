import {
    Anchor,
    Breadcrumbs,
    Tooltip,
    type AnchorProps,
    type BreadcrumbsProps,
    type MantineSize,
    type TooltipProps,
} from '@mantine-8/core';
import { type FC, type HTMLAttributes } from 'react';
import { Link } from 'react-router';
import classes from './PageBreadcrumbs.module.css';

type BreadCrumbItem = {
    title: React.ReactNode;
    to?: string;
    href?: string;
    onClick?: () => void;
    active?: boolean;
    tooltipProps?: Omit<TooltipProps, 'children'>;
};

export interface PageBreadcrumbsProps extends Omit<
    BreadcrumbsProps,
    'children'
> {
    size?: MantineSize;
    items: BreadCrumbItem[];
}

const PageBreadcrumbs: FC<PageBreadcrumbsProps> = ({
    items,
    size = 'lg',
    ...rest
}) => {
    return (
        <Breadcrumbs
            {...rest}
            classNames={{
                root: classes.breadcrumbs,
                separator: classes.separator,
            }}
        >
            {items.map((item, index) => {
                const isClickable = !!(item.onClick || item.to);
                const anchorClassName = `${classes.anchor} ${
                    isClickable ? classes.anchorClickable : classes.anchorStatic
                }`;

                const commonProps: AnchorProps &
                    HTMLAttributes<HTMLAnchorElement> = {
                    size,
                    fw: item.active ? 600 : 500,
                    c: item.active ? 'ldGray.9' : 'ldGray.6',
                    onClick: item.onClick,
                    className: anchorClassName,
                };

                const anchor = item.to ? (
                    <Anchor
                        key={item.tooltipProps ? undefined : index}
                        component={Link}
                        to={item.to}
                        {...commonProps}
                    >
                        {item.title}
                    </Anchor>
                ) : (
                    <Anchor
                        key={item.tooltipProps ? undefined : index}
                        {...commonProps}
                    >
                        {item.title}
                    </Anchor>
                );

                return item.tooltipProps ? (
                    <Tooltip key={index} {...item.tooltipProps}>
                        {anchor}
                    </Tooltip>
                ) : (
                    anchor
                );
            })}
        </Breadcrumbs>
    );
};

export default PageBreadcrumbs;
