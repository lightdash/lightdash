import { HoverCard, Space, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../MantineIcon';
import { DashboardList } from './DashboardList';

type Props = {
    resourceUuid: string;
    withChartData?: boolean;
    description?: string;
    projectUuid: string;
};

export const ResourceInfoPopup: FC<Props> = ({
    resourceUuid,
    description,
    projectUuid,
    withChartData = false,
}) => {
    return (
        <HoverCard
            offset={-1}
            position="bottom"
            withArrow
            shadow="md"
            withinPortal
        >
            <HoverCard.Target>
                <MantineIcon icon={IconInfoCircle} color="gray.6" />
            </HoverCard.Target>
            <HoverCard.Dropdown maw={300}>
                <div>
                    {description && (
                        <>
                            <Text fz="xs" fw={600} color="gray.6">
                                Description:{' '}
                            </Text>
                            <Text fz="xs">{description}</Text>
                        </>
                    )}
                    <>
                        {withChartData && (
                            <>
                                {description && <Space h={8} />}
                                <DashboardList
                                    resourceItemId={resourceUuid}
                                    projectUuid={projectUuid}
                                />
                            </>
                        )}
                    </>
                </div>
            </HoverCard.Dropdown>
        </HoverCard>
    );
};
