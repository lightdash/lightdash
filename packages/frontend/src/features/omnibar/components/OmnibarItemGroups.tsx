import { Accordion, Text } from '@mantine/core';
import { FC, useMemo } from 'react';
import { SearchItem } from '../types/searchItem';
import { getSearchItemLabel } from '../utils/getSearchItemLabel';
import OmnibarItem from './OmnibarItem';

type Props = {
    items: SearchItem[];
    projectUuid: string;
    canUserManageValidation: boolean;
    onClick: (item: SearchItem) => void;
};

type GroupedItems = Partial<Record<SearchItem['type'], SearchItem[]>>;

const OmnibarItemGroups: FC<Props> = ({
    projectUuid,
    items,
    canUserManageValidation,
    onClick,
}) => {
    const groupedTypes = useMemo(() => {
        return items.reduce<GroupedItems>((acc, item) => {
            return { ...acc, [item.type]: (acc[item.type] ?? []).concat(item) };
        }, {});
    }, [items]);

    return (
        <Accordion
            multiple
            defaultValue={Object.keys(groupedTypes)}
            styles={(theme) => ({
                control: {
                    height: theme.spacing.xxl,
                    paddingLeft: theme.spacing.md,
                    paddingRight: theme.spacing.md,
                },
                label: {
                    padding: 0,
                },
                content: {
                    padding: theme.spacing.xs,
                },
            })}
        >
            {Object.entries(groupedTypes).map(([type, groupedItems]) => (
                <Accordion.Item key={type} value={type}>
                    <Accordion.Control>
                        <Text color="dark" fw={500} fz="xs">
                            {/* TODO: fix typing here */}
                            {getSearchItemLabel(type as any)}
                        </Text>
                    </Accordion.Control>

                    <Accordion.Panel>
                        {groupedItems.map((item) => (
                            <OmnibarItem
                                key={item.location.pathname}
                                item={item}
                                onClick={() => onClick(item)}
                                projectUuid={projectUuid}
                                canUserManageValidation={
                                    canUserManageValidation
                                }
                            />
                        ))}
                    </Accordion.Panel>
                </Accordion.Item>
            ))}
        </Accordion>
    );
};

export default OmnibarItemGroups;
