import {
    Anchor,
    Breadcrumbs,
    BreadcrumbsProps,
    MantineSize,
    Text,
} from '@mantine/core';
import { FC } from 'react';
import { Link } from 'react-router-dom';

type BreadCrumbItem = {
    title: React.ReactNode;
    to?: string;
    active?: boolean;
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
                };

                return item.to ? (
                    <Anchor component={Link} to={item.to} {...commonProps}>
                        {item.title}
                    </Anchor>
                ) : (
                    <Text {...commonProps}>{item.title}</Text>
                );
            })}
        </Breadcrumbs>
    );
};

export default PageBreadcrumbs;
