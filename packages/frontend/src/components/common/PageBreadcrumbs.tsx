import {
    Anchor,
    Breadcrumbs,
    Tooltip,
    type AnchorProps,
    type BreadcrumbsProps,
    type MantineSize,
    type TooltipProps,
} from '@mantine/core';
import { type FC, type HTMLAttributes } from 'react';
import { Link } from 'react-router-dom';

type BreadCrumbItem = {
    title: React.ReactNode;
    to?: string;
    href?: string;
    onClick?: () => void;
    active?: boolean;
    tooltipProps?: Omit<TooltipProps, 'children'>;
    state?: unknown;
};

export interface PageBreadcrumbsProps
    extends Omit<BreadcrumbsProps, 'children'> {
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
            styles={{
                root: {
                    display: 'block',
                    flexWrap: 'wrap',
                },
                separator: {
                    display: 'inline-block',
                },
            }}
        >
            {items.map((item, index) => {
                const commonProps: AnchorProps &
                    HTMLAttributes<HTMLAnchorElement> = {
                    size: size,
                    fw: item.active ? 600 : 500,
                    color: item.active ? 'gray.7' : 'gray.6',
                    onClick: item.onClick,
                    sx: {
                        whiteSpace: 'normal',
                        ...(item.onClick || item.to
                            ? {
                                  cursor: 'pointer',
                              }
                            : {
                                  cursor: 'text',
                                  '&:hover': {
                                      textDecoration: 'none',
                                  },
                              }),
                    },
                };

                const anchor = item.to ? (
                    <Anchor
                        key={item.tooltipProps ? undefined : index}
                        component={Link}
                        to={
                            item.state
                                ? {
                                      pathname: item.to,
                                      state: item.state,
                                  }
                                : item.to
                        }
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
