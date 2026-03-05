import {
    Center,
    Divider,
    SegmentedControl,
    Text,
    Tooltip,
    type SegmentedControlProps,
} from '@mantine-8/core';
import { IconInfoCircle } from '@tabler/icons-react';
import React from 'react';
import MantineIcon from '../MantineIcon';
import styles from './AdminContentViewFilter.module.css';

type AdminContentViewFilterProps = {
    withDivider?: boolean;
    segmentedControlProps?: Omit<
        SegmentedControlProps,
        'data' | 'value' | 'onChange'
    >;
    value: 'all' | 'shared';
    onChange: (value: 'all' | 'shared') => void;
};

const AdminContentViewFilter: React.FC<AdminContentViewFilterProps> = ({
    withDivider = true,
    segmentedControlProps,
    value,
    onChange,
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
                radius="md"
                {...segmentedControlProps}
                data={[
                    {
                        value: 'shared',
                        label: (
                            <Center px={'xxs'}>
                                <Text fz="sm" c="ldDark.9">
                                    Shared with me
                                </Text>
                            </Center>
                        ),
                    },
                    {
                        value: 'all',
                        label: (
                            <Center px={'xxs'}>
                                <Tooltip
                                    withArrow
                                    withinPortal
                                    position="top"
                                    label={
                                        'View all public and private spaces in your organization'
                                    }
                                >
                                    <MantineIcon
                                        icon={IconInfoCircle}
                                        color="ldGray.6"
                                    />
                                </Tooltip>
                                <Text fz="sm" c="ldDark.9" ml={'xxs'}>
                                    Admin Content View
                                </Text>
                            </Center>
                        ),
                    },
                ]}
                value={value}
                onChange={(newValue) => {
                    onChange(newValue as 'all' | 'shared');
                }}
            />
        </>
    );
};

export default AdminContentViewFilter;
