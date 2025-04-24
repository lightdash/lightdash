import {
    Center,
    Divider,
    SegmentedControl,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import React from 'react';
import MantineIcon from '../MantineIcon';

type AdminContentViewFilterProps = {
    value: 'all' | 'shared';
    onChange: (value: 'all' | 'shared') => void;
    withDivider?: boolean;
};

const AdminContentViewFilter: React.FC<AdminContentViewFilterProps> = ({
    value,
    onChange,
    withDivider = true,
}) => {
    return (
        <>
            {withDivider && (
                <Divider
                    orientation="vertical"
                    w={1}
                    h={20}
                    sx={{
                        alignSelf: 'center',
                    }}
                />
            )}

            <SegmentedControl
                size="xs"
                radius="md"
                value={value}
                onChange={(newValue) => {
                    onChange(newValue as 'all' | 'shared');
                }}
                data={[
                    {
                        value: 'shared',
                        label: (
                            <Center px={'xxs'}>
                                <Text size="sm" color="gray.7">
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
                                        color="gray.6"
                                    />
                                </Tooltip>
                                <Text size="sm" color="gray.7" ml={'xxs'}>
                                    Admin Content View
                                </Text>
                            </Center>
                        ),
                    },
                ]}
            />
        </>
    );
};

export default AdminContentViewFilter;
