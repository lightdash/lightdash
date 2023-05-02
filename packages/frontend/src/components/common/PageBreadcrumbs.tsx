import {
    Anchor,
    Breadcrumbs,
    BreadcrumbsProps,
    MantineSize,
    Tooltip,
    TooltipProps,
} from '@mantine/core';
import { FC } from 'react';
import { Link } from 'react-router-dom';

type BreadCrumbItem = {
    title: React.ReactNode;
    to?: string;
    href?: string;
    onClick?: () => void;
    active?: boolean;
    tooltipProps?: Omit<TooltipProps, 'children'>;
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
        <Breadcrumbs {...rest}>
            {items.map((item, index) => {
                const commonProps = {
                    key: index,
                    size: size,
                    fw: item.active ? 600 : 500,
                    color: item.active ? 'gray.7' : 'gray.6',
                    onClick: item.onClick,
                    sx:
                        item.onClick || item.to
                            ? { cursor: 'pointer' }
                            : {
                                  cursor: 'text',
                                  '&:hover': {
                                      textDecoration: 'none',
                                  },
                              },
                };

                const anchor = item.to ? (
                    <Anchor component={Link} to={item.to} {...commonProps}>
                        {item.title}
                    </Anchor>
                ) : (
                    <Anchor {...commonProps}>{item.title}</Anchor>
                );

                return item.tooltipProps ? (
                    <Tooltip {...item.tooltipProps}>{anchor}</Tooltip>
                ) : (
                    anchor
                );
            })}
        </Breadcrumbs>
    );
};

export default PageBreadcrumbs;
