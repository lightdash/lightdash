import {
    Center,
    Divider,
    SegmentedControl,
    Text,
    Tooltip,
    type SegmentedControlProps,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import React from 'react';
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
                                    Spaces
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
                                              Shared with me
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
                                              label={
                                                  'View all public and private spaces in your organization'
                                              }
                                          >
                                              <MantineIcon
                                                  icon={IconInfoCircle}
                                                  color="dimmed"
                                              />
                                          </Tooltip>
                                          <Text fz="sm" c="ldDark.9" ml={'xxs'}>
                                              Admin Content View
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
