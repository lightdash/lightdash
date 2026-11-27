import { ContentType, FeatureFlags } from '@lightdash/common';
import { Box, Divider, SegmentedControl, Text, Tooltip } from '@mantine/core';
import type { FC } from 'react';
import {
    BarChartIcon,
    CustomChartTypeIcon,
    DashboardIcon,
    DataAppIcon,
    DocumentIcon,
    SpaceIcon,
} from '../../../components/common/ContentIcons';
import MantineIcon from '../../../components/common/MantineIcon';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { useChartTypesEnabled } from '../../chartTypes/hooks/useChartTypesEnabled';
import {
    CHART_TYPES_FILTER_VALUE,
    type DeletedContentTypeFilter,
} from '../types';
import classes from './ContentTypeFilter.module.css';

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
    const { enabled: chartTypesEnabled } = useChartTypesEnabled();

    const iconProps = {
        style: { display: 'block' },
        size: 18,
        stroke: 1.5,
    };

    const data = [
        {
            value: 'all',
            label: (
                <Tooltip label="Show all deleted items">
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
                <Tooltip label="Show only deleted charts" maw={200}>
                    <Box>
                        <MantineIcon icon={BarChartIcon} {...iconProps} />
                    </Box>
                </Tooltip>
            ),
        },
        {
            value: ContentType.DASHBOARD,
            label: (
                <Tooltip label="Show only deleted dashboards">
                    <Box>
                        <MantineIcon icon={DashboardIcon} {...iconProps} />
                    </Box>
                </Tooltip>
            ),
        },
        {
            value: ContentType.DOCUMENT,
            label: (
                <Tooltip label="Show only deleted documents">
                    <Box aria-label="Documents">
                        <MantineIcon icon={DocumentIcon} {...iconProps} />
                    </Box>
                </Tooltip>
            ),
        },
        ...(dataAppsEnabled
            ? [
                  {
                      value: ContentType.DATA_APP,
                      label: (
                          <Tooltip label="Show only deleted data apps">
                              <Box aria-label="Data apps">
                                  <MantineIcon
                                      icon={DataAppIcon}
                                      {...iconProps}
                                  />
                              </Box>
                          </Tooltip>
                      ),
                  },
              ]
            : []),
        ...(chartTypesEnabled
            ? [
                  {
                      value: CHART_TYPES_FILTER_VALUE,
                      label: (
                          <Tooltip label="Show only deleted custom chart types">
                              <Box aria-label="Custom chart types">
                                  <MantineIcon
                                      icon={CustomChartTypeIcon}
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
                <Tooltip label="Show only deleted spaces">
                    <Box>
                        <MantineIcon icon={SpaceIcon} {...iconProps} />
                    </Box>
                </Tooltip>
            ),
        },
    ];

    return (
        <>
            <Divider orientation="vertical" w={1} h={20} />
            <SegmentedControl
                size="xs"
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
