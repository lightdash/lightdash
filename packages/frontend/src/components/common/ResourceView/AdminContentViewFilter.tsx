import {
    Center,
    Divider,
    SegmentedControl,
    Select,
    Text,
    Tooltip,
    useMatches,
    type SegmentedControlProps,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../MantineIcon';
import styles from './AdminContentViewFilter.module.css';

export type ContentViewValue = 'shared' | 'shared-with-me' | 'all';

type AdminContentViewFilterProps = {
    withDivider?: boolean;
    segmentedControlProps?: Omit<
        SegmentedControlProps,
        'data' | 'value' | 'onChange'
    >;
    value: ContentViewValue;
    onChange: (value: ContentViewValue) => void;
    /** Adds the all-user "Shared with me" segment (root browsing only). */
    withSharedWithMe?: boolean;
    /** Hides the admin-only segment for non-admin viewers. */
    withAdminView?: boolean;
};

const AdminContentViewFilter: React.FC<AdminContentViewFilterProps> = ({
    withDivider = true,
    segmentedControlProps,
    value,
    onChange,
    withSharedWithMe = false,
    withAdminView = true,
}) => {
    const { t } = useTranslation('resourceView');
    const compact = useMatches(
        { base: true, sm: false },
        { getInitialValueInEffect: false },
    );
    if (compact) {
        return (
            <Select
                aria-label={t('contentViewFilter.ariaLabel')}
                miw={112}
                maw={160}
                flex="1 1 112px"
                value={value}
                allowDeselect={false}
                onChange={(next) => {
                    if (
                        next === 'shared' ||
                        next === 'shared-with-me' ||
                        next === 'all'
                    )
                        onChange(next);
                }}
                data={[
                    {
                        value: 'shared',
                        label: t('contentViewFilter.spaces'),
                    },
                    ...(withSharedWithMe
                        ? [
                              {
                                  value: 'shared-with-me',
                                  label: t('contentViewFilter.sharedWithMe'),
                              },
                          ]
                        : []),
                    ...(withAdminView
                        ? [
                              {
                                  value: 'all',
                                  label: t(
                                      'contentViewFilter.adminContentView',
                                  ),
                              },
                          ]
                        : []),
                ]}
            />
        );
    }
    return (
        <>
            {withDivider && (
                <Divider
                    orientation="vertical"
                    w={1}
                    h={20}
                    className={styles.divider}
                />
            )}

            <SegmentedControl
                size="xs"
                {...segmentedControlProps}
                data={[
                    {
                        value: 'shared',
                        label: (
                            <Center px={'xxs'}>
                                <Text fz="sm" c="ldDark.9">
                                    {t('contentViewFilter.spaces')}
                                </Text>
                            </Center>
                        ),
                    },
                    ...(withSharedWithMe
                        ? [
                              {
                                  value: 'shared-with-me',
                                  label: (
                                      <Center px={'xxs'}>
                                          <Text fz="sm" c="ldDark.9">
                                              {t(
                                                  'contentViewFilter.sharedWithMe',
                                              )}
                                          </Text>
                                      </Center>
                                  ),
                              },
                          ]
                        : []),
                    ...(withAdminView
                        ? [
                              {
                                  value: 'all',
                                  label: (
                                      <Center px={'xxs'}>
                                          <Tooltip
                                              position="top"
                                              label={t(
                                                  'contentViewFilter.adminContentViewTooltip',
                                              )}
                                          >
                                              <MantineIcon
                                                  icon={IconInfoCircle}
                                                  color="dimmed"
                                              />
                                          </Tooltip>
                                          <Text fz="sm" c="ldDark.9" ml={'xxs'}>
                                              {t(
                                                  'contentViewFilter.adminContentView',
                                              )}
                                          </Text>
                                      </Center>
                                  ),
                              },
                          ]
                        : []),
                ]}
                value={value}
                onChange={(newValue) => {
                    onChange(newValue as ContentViewValue);
                }}
            />
        </>
    );
};

export default AdminContentViewFilter;
