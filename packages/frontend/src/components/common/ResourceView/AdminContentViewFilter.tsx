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
    const compact = useMatches(
        { base: true, sm: false },
        { getInitialValueInEffect: false },
    );
    if (compact) {
        return (
            <Select
                aria-label="Content view"
                w="100%"
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
                    { value: 'shared', label: 'Spaces' },
                    ...(withSharedWithMe
                        ? [{ value: 'shared-with-me', label: 'Shared with me' }]
                        : []),
                    ...(withAdminView
                        ? [{ value: 'all', label: 'Admin Content View' }]
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
