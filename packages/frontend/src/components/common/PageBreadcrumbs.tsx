import {
    Anchor,
    Breadcrumbs,
    Tooltip,
    type AnchorProps,
    type BreadcrumbsProps,
    type MantineSize,
    type TooltipProps,
} from '@mantine-8/core';
import { useMemo, useState, type FC, type HTMLAttributes } from 'react';
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

type EllipsisItem = { type: 'ellipsis' };

type VisibleItem = BreadCrumbItem | EllipsisItem;

function isEllipsis(item: VisibleItem): item is EllipsisItem {
    return 'type' in item && item.type === 'ellipsis';
}

const VISIBLE_START = 2;
const VISIBLE_END = 2;
const COLLAPSE_THRESHOLD = VISIBLE_START + VISIBLE_END + 1;

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
    const [expandedForItemsLength, setExpandedForItemsLength] = useState<
        number | null
    >(null);
    const isExpanded = expandedForItemsLength === items.length;

    const visibleItems: VisibleItem[] = useMemo(() => {
        if (isExpanded || items.length <= COLLAPSE_THRESHOLD) {
            return items;
        }

        return [
            ...items.slice(0, VISIBLE_START),
            { type: 'ellipsis' },
            ...items.slice(items.length - VISIBLE_END),
        ];
    }, [items, isExpanded]);

    return (
        <Breadcrumbs
            {...rest}
            classNames={{
                root: classes.breadcrumbs,
                separator: classes.separator,
            }}
        >
            {visibleItems.map((item, index) => {
                if (isEllipsis(item)) {
                    return (
                        <Anchor
                            key="ellipsis"
                            size={size}
                            fw={500}
                            c="ldGray.6"
                            className={`${classes.anchor} ${classes.anchorClickable}`}
                            onClick={() =>
                                setExpandedForItemsLength(items.length)
                            }
                        >
                            ...
                        </Anchor>
                    );
                }

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
