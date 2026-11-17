import { type AppClarifyQuestion } from '@lightdash/common';
import { Box } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type FC } from 'react';
import promptBar from '../features/chartTypes/builder/BuilderPromptBar.module.css';
import ClarifyingQuestions from '../features/chartTypes/builder/ClarifyingQuestions';

const QUESTIONS: AppClarifyQuestion[] = [
    {
        question:
            'Should teams be compared side by side, or stacked into one total?',
        options: ['Side by side', 'Stacked'],
    },
    {
        question: 'Is revenue shown over time, or as a single period per team?',
        options: ['Over time', 'Single period'],
    },
    {
        question: 'How should teams beyond the top few be handled?',
        options: ['Group as Other', 'Show all', 'Hide them'],
    },
    {
        question: 'Absolute revenue, or each team’s share of the total?',
        options: [],
    },
];

type Props = {
    prompt: string;
    questions: AppClarifyQuestion[];
    initialAnswers: string[];
};

/** The sheet positions against the composer's host, so the story supplies the
 *  same host and leaves room above for it to grow into. */
const Harness: FC<Props> = ({ prompt, questions, initialAnswers }) => {
    const [answers, setAnswers] = useState(initialAnswers);

    return (
        <Box pt={360} pb="xl" px="xl">
            <Box className={promptBar.pillHost} mx="auto">
                <ClarifyingQuestions
                    prompt={prompt}
                    questions={questions}
                    answers={answers}
                    onAnswer={(index, value) =>
                        setAnswers((current) => {
                            const next = [...current];
                            next[index] = value;
                            return next;
                        })
                    }
                    onEditPrompt={() => undefined}
                    onSkip={() => undefined}
                    onBuild={() => undefined}
                />
            </Box>
        </Box>
    );
};

const meta: Meta<typeof Harness> = {
    title: 'Chart types/Clarifying questions',
    component: Harness,
    parameters: { layout: 'fullscreen' },
    args: {
        prompt: 'a chart that shows performance',
        questions: QUESTIONS.slice(0, 3),
        initialAnswers: ['', '', ''],
    },
};

export default meta;

type Story = StoryObj<typeof Harness>;

/** How the round opens: the first question with its suggested answers. */
export const Unanswered: Story = {};

/** An answer already entered. */
export const PartiallyAnswered: Story = {
    args: { initialAnswers: ['Side by side', '', ''] },
};

/** The cap, at the longest the clarifier's own prompt allows. */
export const FourQuestions: Story = {
    args: { questions: QUESTIONS, initialAnswers: ['', '', '', ''] },
};

/** One question: no counter, just a lead-in. */
export const SingleQuestion: Story = {
    args: {
        questions: [
            {
                question: 'Over time, or a single period?',
                options: ['Over time', 'Single period'],
            },
        ],
        initialAnswers: [''],
    },
};
