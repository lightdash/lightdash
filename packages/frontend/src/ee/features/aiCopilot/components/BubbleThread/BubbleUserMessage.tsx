import { Badge, Card, Group, Text } from '@mantine/core';
import { type FC } from 'react';
import classes from './BubbleThread.module.css';

type Props = {
    /** The numbers of the marks sent with the message. */
    marks: number[];
    /** What the user said and typed; empty when they only marked. */
    words: string;
};

/** The user's own message in a bubble: their marks and their words, nothing generated. */
const BubbleUserMessage: FC<Props> = ({ marks, words }) => (
    <Card
        radius="lg"
        py="xs"
        px="md"
        withBorder={false}
        className={classes.userMessage}
    >
        {marks.length > 0 && (
            <Group gap={4} mb={words === '' ? 0 : 4}>
                {marks.map((number) => (
                    <Badge
                        key={number}
                        circle
                        size="md"
                        color="red"
                        variant="filled"
                        aria-label={`Mark ${number}`}
                    >
                        {number}
                    </Badge>
                ))}
            </Group>
        )}
        {words !== '' && (
            <Text size="sm" className={classes.userWords}>
                {words}
            </Text>
        )}
    </Card>
);

export default BubbleUserMessage;
