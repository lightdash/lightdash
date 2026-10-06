import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { aiRolePreviewText, type SchemaPatternSelection } from './schemaRule';
import { SchemaRuleInput } from './SchemaRuleInput';

const catalog = ['DB.PUBLIC', 'DB.PII_PEOPLE', 'DB.EVENTS_RAW', 'OTHER.PUBLIC'];
const Harness = ({
    initial,
    schemas,
}: {
    initial: SchemaPatternSelection;
    schemas: string[] | null;
}) => {
    const [value, onChange] = useState(initial);
    return (
        <MantineProvider>
            <SchemaRuleInput
                value={value}
                onChange={onChange}
                catalogSchemas={schemas ?? catalog}
                label="Exclude schemas that match"
                description={null}
                preview={aiRolePreviewText}
            />
        </MantineProvider>
    );
};
describe('SchemaRuleInput', () => {
    it('allows empty exclusions and warns about access to all schemas', () => {
        render(
            <Harness
                schemas={null}
                initial={{ database: 'DB', patterns: [] }}
            />,
        );
        expect(
            screen.getByLabelText('Exclude schemas that match', {
                selector: 'input',
            }),
        ).toHaveValue('');
        expect(screen.getByRole('alert')).toHaveTextContent(
            'This AI role can read all schemas in the database.',
        );
        expect(
            screen.getByText('3 schemas allowed, 0 excluded'),
        ).toBeInTheDocument();
    });
    it('validates entered patterns without trying to expand invalid rules', async () => {
        render(
            <Harness
                schemas={null}
                initial={{
                    database: 'DB',
                    patterns: [],
                }}
            />,
        );
        await userEvent.type(
            screen.getByLabelText('Exclude schemas that match', {
                selector: 'input',
            }),
            'bad.pattern{enter}',
        );
        expect(
            screen.getByText('Use letters, digits, _, $, * and ?.'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Complete the rule to preview schemas.'),
        ).toBeInTheDocument();
    });
    it('previews several patterns and excludes other databases', () => {
        render(
            <Harness
                schemas={null}
                initial={{
                    database: 'DB',
                    patterns: ['pii_*', '*_RAW'],
                }}
            />,
        );
        expect(
            screen.getByText('1 schema allowed, 2 excluded'),
        ).toBeInTheDocument();
        expect(screen.getByText('DB.PII_PEOPLE')).toBeInTheDocument();
        expect(screen.getByText('DB.EVENTS_RAW')).toBeInTheDocument();
        expect(screen.queryByText('OTHER.PUBLIC')).not.toBeInTheDocument();
    });
    it('limits rendered names for a catalog with 1500 schemas', () => {
        render(
            <Harness
                schemas={Array.from(
                    { length: 1500 },
                    (_, index) => `DB.S${index}`,
                )}
                initial={{
                    database: 'DB',
                    patterns: ['*'],
                }}
            />,
        );
        expect(
            screen.getByText('0 schemas allowed, 1500 excluded'),
        ).toBeInTheDocument();
        expect(screen.getByText('and 1450 more')).toBeInTheDocument();
        expect(screen.getAllByText(/^DB\.S/)).toHaveLength(50);
    });
});

it('lets an admin remove every pattern independently', async () => {
    render(
        <Harness
            schemas={null}
            initial={{ database: 'DB', patterns: ['PII_*', '*_RAW', '*'] }}
        />,
    );
    const input = screen.getByLabelText('Exclude schemas that match', {
        selector: 'input',
    });
    await userEvent.click(input);
    for (let remaining = 2; remaining >= 0; remaining -= 1) {
        await userEvent.keyboard('{Backspace}');
    }
    expect(screen.queryByText('PII_*')).not.toBeInTheDocument();
    expect(screen.queryByText('*_RAW')).not.toBeInTheDocument();
    expect(screen.queryByText('*')).not.toBeInTheDocument();
    expect(
        screen.getByText('3 schemas allowed, 0 excluded'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/locked|all.roles/i)).not.toBeInTheDocument();
});
