#!/usr/bin/env tsx
import { Effect, pipe } from 'effect';
import * as readline from 'readline';
import { parse } from './src/parser';
import { generateSQL } from './src/generators';
import type { SqlDialect } from './src/generators';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

let currentDialect: SqlDialect = 'postgres';

const processFormula = async (formula: string): Promise<void> => {
    const program = pipe(
        parse(formula),
        Effect.flatMap((ast) =>
            generateSQL(ast, {
                dialect: currentDialect,
                fieldResolver: (field) => Effect.succeed(field),
            }),
        ),
    );

    const result = await Effect.runPromiseExit(program);

    if (result._tag === 'Success') {
        console.log(`\n✅ SQL (${currentDialect}):`);
        console.log(`   ${result.value}\n`);
    } else if (result._tag === 'Failure' && result.cause._tag === 'Fail') {
        const error = result.cause.error as any;
        console.log(`\n❌ Error: ${error.message || JSON.stringify(error)}\n`);
    } else {
        console.log(`\n❌ Unexpected error\n`);
    }
};

const showExamples = () => {
    console.log('\n📚 Example Formulas:');
    console.log('  1. ${revenue} + ${cost}');
    console.log('  2. sum(${sales})');
    console.log('  3. ${revenue} / sum(${revenue}) * 100');
    console.log('  4. if(${status} = "active", ${amount} * 1.1, ${amount})');
    console.log('  5. cumsum(${amount})');
    console.log('  6. lag(${value}, 1)');
    console.log('  7. ${first_name} & " " & ${last_name}');
    console.log('  8. round(avg(${price}), 2)');
    console.log('  9. ${a} > 10 and ${b} < 20');
    console.log('  10. (${revenue} - lag(${revenue}, 12)) / lag(${revenue}, 12) * 100\n');
};

const showHelp = () => {
    console.log('\n📖 Commands:');
    console.log('  .help                - Show this help');
    console.log('  .examples            - Show example formulas');
    console.log('  .dialect [name]      - Change/show SQL dialect (postgres, bigquery, duckdb)');
    console.log('  .exit                - Exit REPL\n');
};

const prompt = () => {
    rl.question(`[${currentDialect}] > `, async (input) => {
        const trimmed = input.trim();

        if (!trimmed) {
            prompt();
            return;
        }

        if (trimmed === '.exit') {
            console.log('Goodbye! 👋\n');
            rl.close();
            return;
        }

        if (trimmed === '.help') {
            showHelp();
            prompt();
            return;
        }

        if (trimmed === '.examples') {
            showExamples();
            prompt();
            return;
        }

        if (trimmed.startsWith('.dialect')) {
            const parts = trimmed.split(/\s+/);
            const newDialect = parts[1];

            if (!newDialect) {
                console.log(`Current dialect: ${currentDialect}`);
                console.log('Available: postgres, bigquery, duckdb\n');
                prompt();
                return;
            }

            if (
                newDialect === 'postgres' ||
                newDialect === 'bigquery' ||
                newDialect === 'duckdb'
            ) {
                currentDialect = newDialect;
                console.log(`✓ Dialect changed to: ${currentDialect}\n`);
            } else {
                console.log('❌ Invalid dialect. Choose: postgres, bigquery, duckdb\n');
            }
            prompt();
            return;
        }

        await processFormula(trimmed);
        prompt();
    });
};

console.log('🧮 Table Calculations Demo REPL');
console.log('================================\n');
console.log('Convert spreadsheet formulas to SQL!');
console.log('Type .help for commands, .examples for sample formulas\n');

prompt();
