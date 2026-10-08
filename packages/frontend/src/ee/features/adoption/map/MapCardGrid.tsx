import { Paper, SimpleGrid, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { PolymorphicPaperButton } from '../../../../components/common/PolymorphicPaperButton';
import styles from './AdoptionMap.module.css';
import { type MapCard } from './mapCards';

type Props = {
    cards: MapCard[];
    onDepartmentClick: (departmentUuid: string) => void;
};

const CardBody: FC<{ card: MapCard }> = ({ card }) => (
    <Stack gap={2}>
        <Text fz="xs" c="dimmed" fw={500}>
            {card.title}
        </Text>
        <Text fz="md" fw={600}>
            {card.value}
        </Text>
        <Text fz="xs" c="dimmed">
            {card.detail}
        </Text>
    </Stack>
);

export const MapCardGrid: FC<Props> = ({ cards, onDepartmentClick }) => (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
        {cards.map((card) => {
            const { departmentUuid } = card;
            return departmentUuid === null ? (
                <Paper key={card.key} p="md">
                    <CardBody card={card} />
                </Paper>
            ) : (
                <PolymorphicPaperButton
                    key={card.key}
                    component="button"
                    type="button"
                    p="md"
                    className={styles.card}
                    onClick={() => onDepartmentClick(departmentUuid)}
                >
                    <CardBody card={card} />
                </PolymorphicPaperButton>
            );
        })}
    </SimpleGrid>
);
