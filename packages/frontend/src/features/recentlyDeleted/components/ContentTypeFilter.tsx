import { ContentType, FeatureFlags } from '@lightdash/common';
import { Box, Divider, SegmentedControl, Text, Tooltip } from '@mantine-8/core';
import {
    IconAppWindow,
    IconChartBar,
    IconFolder,
    IconLayoutDashboard,
} from '@tabler/icons-react';
import type { FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import classes from './ContentTypeFilter.module.css';

type DeletedContentTypeFilter =
    | 'all'
    | ContentType.CHART
    | ContentType.DASHBOARD
    | ContentType.SPACE
    | ContentType.DATA_APP;

type ContentTypeFilterProps = {
    selectedContentType: DeletedContentTypeFilter;
    setSelectedContentType: (value: DeletedContentTypeFilter) => void;
};

export const ContentTypeFilter: FC<ContentTypeFilterProps> = ({
    selectedContentType,
    setSelectedContentType,
}) => {
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const dataAppsEnabled = dataAppsFlag.data?.enabled ?? false;

    const iconProps = {
        style: { display: 'block' },
        size: 18,
        stroke: 1.5,
    };

    const data = [
        {
            value: 'all',
            label: (
                <Tooltip label="Show all deleted items" withinPortal>
                    <Box>
                        <Text fz="xs" fw={500}>
                            All
                        </Text>
                    </Box>
                </Tooltip>
            ),
        },
        {
            value: ContentType.CHART,
            label: (
                <Tooltip
                    variant="xs"
                    label="Show only deleted charts"
                    withinPortal
                    maw={200}
                >
                    <Box>
                        <MantineIcon icon={IconChartBar} {...iconProps} />
                    </Box>
                </Tooltip>
            ),
        },
        {
            value: ContentType.DASHBOARD,
            label: (
                <Tooltip label="Show only deleted dashboards" withinPortal>
                    <Box>
                        <MantineIcon
                            icon={IconLayoutDashboard}
                            {...iconProps}
                        />
                    </Box>
                </Tooltip>
            ),
        },
        ...(dataAppsEnabled
            ? [
                  {
                      value: ContentType.DATA_APP,
                      label: (
                          <Tooltip
                              label="Show only deleted data apps"
                              withinPortal
                          >
                              <Box>
                                  <MantineIcon
                                      icon={IconAppWindow}
                                      {...iconProps}
                                  />
                              </Box>
                          </Tooltip>
                      ),
                  },
              ]
            : []),
        {
            value: ContentType.SPACE,
            label: (
                <Tooltip label="Show only deleted spaces" withinPortal>
                    <Box>
                        <MantineIcon icon={IconFolder} {...iconProps} />
                    </Box>
                </Tooltip>
            ),
        },
    ];

    return (
        <>
            <Divider
                orientation="vertical"
                w={1}
                h={20}
                style={{ alignSelf: 'center' }}
            />
            <SegmentedControl
                size="xs"
                radius="md"
                value={selectedContentType}
                onChange={(value) =>
                    setSelectedContentType(value as DeletedContentTypeFilter)
                }
                classNames={{
                    root: classes.segmentedControl,
                    indicator: classes.indicator,
                    label: classes.label,
                }}
                data={data}
            />
        </>
    );
};
