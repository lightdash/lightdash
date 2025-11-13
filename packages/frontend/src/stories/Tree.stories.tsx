import { Paper, ScrollArea } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react';

import Tree from '../components/common/Tree/Tree';

const meta: Meta<typeof Tree> = {
    decorators: [
        (renderStory: Function) => (
            <Paper
                component={ScrollArea}
                w="300px"
                h="500px"
                withBorder
                px="sm"
                py="xs"
            >
                {renderStory()}
            </Paper>
        ),
    ],
    component: Tree,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Tree>;

const data = [
    {
        uuid: 'fake0',
        name: 'The most main space',
        path: 'the_most_main_space',
    },
    {
        uuid: 'fake1',
        name: 'Main space',
        path: 'main_space',
    },
    {
        uuid: 'fake2',
        name: 'Sub space',
        path: 'main_space.sub',
    },
    {
        uuid: 'fake3',
        name: 'Sub space 2',
        path: 'main_space.sub2',
    },
    {
        uuid: 'fake4',
        name: 'Sub space 3',
        path: 'main_space.sub3',
    },
    {
        uuid: 'fake5',
        name: 'Sub of sub space',
        path: 'main_space.sub.sub_of_sub',
    },
    {
        uuid: 'fake6',
        name: 'Sub of sub space 2',
        path: 'main_space.sub.sub_of_sub2',
    },
    {
        uuid: 'fake7',
        name: 'Sub of sub space 3',
        path: 'main_space.sub.sub_of_sub3',
    },
    {
        uuid: 'fake10',
        name: 'Sub of sub of sub space',
        path: 'main_space.sub.sub_of_sub.sub_of_sub_of_sub',
    },
    {
        uuid: 'fake11',
        name: 'Sub of sub of sub space 2',
        path: 'main_space.sub.sub_of_sub.sub_of_sub_of_sub2',
    },
    {
        uuid: 'fake12',
        name: 'Sub of sub of sub sub space',
        path: 'main_space.sub.sub_of_sub.sub_of_sub_of_sub.sub_of_sub_of_sub_of_sub',
    },
    {
        uuid: 'fake13',
        name: 'Sub of sub of sub sub space 2',
        path: 'main_space.sub.sub_of_sub.sub_of_sub_of_sub.sub_of_sub_of_sub_of_sub2',
    },
    {
        uuid: 'fake14',
        name: 'Kinda top level space',
        path: 'kinda_top_level_space',
    },
    {
        uuid: 'fake15',
        name: 'Kinda top level space 2',
        path: 'kinda_top_level_space2',
    },
    {
        uuid: 'fake16',
        name: 'Kinda top level space 3',
        path: 'kinda_top_level_space3',
    },
];

export const Primary: Story = {
    args: {
        value: 'fake11',
        topLevelLabel: 'All spaces',
        data,
        onChange: (selectedUuid) => {
            console.info('Selected item UUID:', selectedUuid);
        },
    },
};

export const Multiple: Story = {
    args: {
        type: 'multiple',
        topLevelLabel: 'All spaces',
        values: ['fake16'],
        data,
        onChangeMultiple: (selectedUuids) => {
            console.info('Selected items UUIDs:', selectedUuids);
        },
    },
};
