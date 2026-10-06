import {
    AiIdentitySchemaRuleMode,
    type AiIdentitySchemaRule,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { aiRolePreviewText } from './schemaRule';
import { SchemaRuleInput } from './SchemaRuleInput';

const catalog = ['DB.PUBLIC', 'DB.PII_PEOPLE', 'DB.EVENTS_RAW', 'OTHER.PUBLIC'];
const Harness = ({
    initial,
    allowExistingRole,
    schemas,
}: {
    initial: AiIdentitySchemaRule;
    allowExistingRole: boolean;
    schemas: string[] | null;
}) => {
    const [value, onChange] = useState(initial);
    return (
        <MantineProvider>
            <SchemaRuleInput
                value={value}
                onChange={onChange}
                catalogSchemas={schemas ?? catalog}
                allowExistingRole={allowExistingRole}
                label="Schema rule"
                description={null}
                preview={aiRolePreviewText}
            />
        </MantineProvider>
    );
};
const chooseMode = (label: string) => {
    fireEvent.click(
        screen.getByLabelText('Schema rule', { selector: 'input' }),
    );
    fireEvent.click(screen.getByRole('option', { name: label }));
};
describe('SchemaRuleInput', () => {
    it('starts without patterns and supports each mode', () => {
        render(
            <Harness
                allowExistingRole
                schemas={null}
                initial={{
                    mode: AiIdentitySchemaRuleMode.ALL_EXCEPT,
                    database: 'DB',
                    patterns: [],
                }}
            />,
        );
        expect(
            screen.getByLabelText('Patterns', { selector: 'input' }),
        ).toHaveValue('');
        expect(
            screen.getByText('Complete the rule to preview schema access.'),
        ).toBeInTheDocument();
        chooseMode('Only schemas whose names match');
        expect(
            screen.getByLabelText('Patterns', { selector: 'input' }),
        ).toHaveValue('');
        chooseMode('Pick schemas');
        fireEvent.click(
            screen.getByLabelText('Schemas', { selector: 'input' }),
        );
        fireEvent.click(screen.getByRole('option', { name: 'DB.PUBLIC' }));
        expect(
            screen.getByText('1 schema allowed, 0 excluded'),
        ).toBeInTheDocument();
        chooseMode('Use an existing role');
        expect(
            screen.queryByLabelText('Patterns', { selector: 'input' }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByText(
                'The existing role keeps its current schema access.',
            ),
        ).toBeInTheDocument();
    });
    it('validates entered patterns without trying to expand invalid rules', async () => {
        render(
            <Harness
                allowExistingRole
                schemas={null}
                initial={{
                    mode: AiIdentitySchemaRuleMode.ALL_EXCEPT,
                    database: 'DB',
                    patterns: [],
                }}
            />,
        );
        await userEvent.type(
            screen.getByLabelText('Patterns', { selector: 'input' }),
            'bad.pattern{enter}',
        );
        expect(
            screen.getByText('Use letters, digits, _, $, * and ?.'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Complete the rule to preview schema access.'),
        ).toBeInTheDocument();
    });
    it('previews several patterns and excludes other databases', () => {
        render(
            <Harness
                allowExistingRole
                schemas={null}
                initial={{
                    mode: AiIdentitySchemaRuleMode.ALL_EXCEPT,
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
                allowExistingRole
                schemas={Array.from(
                    { length: 1500 },
                    (_, index) => `DB.S${index}`,
                )}
                initial={{
                    mode: AiIdentitySchemaRuleMode.ALL_EXCEPT,
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
    it('hides existing roles when the caller does not allow them', () => {
        render(
            <Harness
                schemas={null}
                allowExistingRole={false}
                initial={{ mode: AiIdentitySchemaRuleMode.LIST, schemas: [] }}
            />,
        );
        fireEvent.click(
            screen.getByLabelText('Schema rule', { selector: 'input' }),
        );
        expect(
            screen.queryByRole('option', { name: 'Use an existing role' }),
        ).not.toBeInTheDocument();
    });
});
