import { ContentType, FeatureFlags } from '@lightdash/common';
import { Box, Divider, SegmentedControl, Text, Tooltip } from '@mantine/core';
import {
    IconAppWindow,
    IconChartBar,
    IconFolder,
    IconFileText,
    IconLayoutDashboard,
    IconPuzzle,
} from '@tabler/icons-react';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../components/common/MantineIcon';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
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
    const { t } = useTranslation('settings');
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const dataAppsEnabled = dataAppsFlag.data?.enabled ?? false;
    const documentsFlag = useServerFeatureFlag(FeatureFlags.Documents);
    const documentsEnabled =
        !documentsFlag.isError && documentsFlag.data?.enabled;

    const iconProps = {
        style: { display: 'block' },
        size: 18,
        stroke: 1.5,
    };

    const data = [
        {
            value: 'all',
            label: (
                <Tooltip label={t('recentlyDeleted.filters.allTooltip')}>
                    <Box>
                        <Text fz="xs" fw={500}>
                            {t('recentlyDeleted.filters.all')}
                        </Text>
                    </Box>
                </Tooltip>
            ),
        },
        {
            value: ContentType.CHART,
            label: (
                <Tooltip
                    label={t('recentlyDeleted.filters.chartsTooltip')}
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
                <Tooltip label={t('recentlyDeleted.filters.dashboardsTooltip')}>
                    <Box>
                        <MantineIcon
                            icon={IconLayoutDashboard}
                            {...iconProps}
                        />
                    </Box>
                </Tooltip>
            ),
        },
        ...(documentsEnabled
            ? [
                  {
                      value: ContentType.DOCUMENT,
                      label: (
                          <Tooltip
                              label={t(
                                  'recentlyDeleted.filters.documentsTooltip',
                              )}
                          >
                              <Box
                                  aria-label={t(
                                      'recentlyDeleted.filters.documentsLabel',
                                  )}
                              >
                                  <MantineIcon
                                      icon={IconFileText}
                                      {...iconProps}
                                  />
                              </Box>
                          </Tooltip>
                      ),
                  },
              ]
            : []),
        ...(dataAppsEnabled
            ? [
                  {
                      value: ContentType.DATA_APP,
                      label: (
                          <Tooltip
                              label={t(
                                  'recentlyDeleted.filters.dataAppsTooltip',
                              )}
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
                  {
                      value: CHART_TYPES_FILTER_VALUE,
                      label: (
                          <Tooltip
                              label={t(
                                  'recentlyDeleted.filters.chartTypesTooltip',
                              )}
                          >
                              <Box>
                                  <MantineIcon
                                      icon={IconPuzzle}
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
                <Tooltip label={t('recentlyDeleted.filters.spacesTooltip')}>
                    <Box>
                        <MantineIcon icon={IconFolder} {...iconProps} />
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
