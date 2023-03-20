import { Anchor, Breadcrumbs, BreadcrumbsProps, Text } from '@mantine/core';
import React, { FC } from 'react';

type BreadCrumbItem = {
    title: string;
    href: string;
};

export interface PageBreadcrumbsProps extends BreadcrumbsProps {
    items: BreadCrumbItem[];
}

const PageBreadcrumbs: FC<PageBreadcrumbsProps> = ({
    items,
    separator,
    children,
    ...rest
}) => {
    return (
        <Breadcrumbs separator={separator ? separator : '/'} mt="xs" {...rest}>
            {items.map((item, index) => (
                <Anchor
                    href={item.href}
                    key={index}
                    color="gray.7"
                    underline={false}
                >
                    <Text fw={500} fz="lg" color="gray.7">
                        {item.title}
                    </Text>
                </Anchor>
            ))}
            <Text fw={500} fz="lg">
                {children}
            </Text>
        </Breadcrumbs>
    );
};

export default PageBreadcrumbs;
