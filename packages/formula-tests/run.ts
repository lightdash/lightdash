import * as fs from 'fs';
import * as path from 'path';
import { getWarehouseConfig, TIER_WAREHOUSES } from './config';
import type { Tier, WarehouseType } from './config';
import type { TestCase, TestResult } from './types';
import { createConnection } from './runner/warehouse-connections';
import { runTestCase } from './runner/executor';
import { formatResults } from './runner/reporter';

// Import all test cases
import { arithmeticCases } from './cases/arithmetic.cases';
import { stringCases } from './cases/string.cases';
import { logicalCases } from './cases/logical.cases';
import { nullHandlingCases } from './cases/null-handling.cases';
import { mathCases } from './cases/math.cases';
import { dateCases } from './cases/date.cases';
import { aggregationCases } from './cases/aggregation.cases';
import { edgeCases } from './cases/edge-cases.cases';
import { windowCases } from './cases/window.cases';
import { conditionalAggCases } from './cases/conditional-agg.cases';
import { securityCases } from './cases/security.cases';
import { parenthesesCases } from './cases/parentheses.cases';

const ALL_CASES: TestCase[] = [
    ...arithmeticCases,
    ...stringCases,
    ...logicalCases,
    ...nullHandlingCases,
    ...mathCases,
    ...dateCases,
    ...aggregationCases,
    ...edgeCases,
    ...windowCases,
    ...conditionalAggCases,
    ...securityCases,
    ...parenthesesCases,
];

function parseTier(args: string[]): Tier {
    const tierIdx = args.indexOf('--tier');
    if (tierIdx === -1 || tierIdx + 1 >= args.length) return 'fast';
    const tier = args[tierIdx + 1] as Tier;
    if (!TIER_WAREHOUSES[tier]) {
        console.error(`Unknown tier: ${tier}. Valid: fast, tier1, tier2, all`);
        process.exit(1);
    }
    return tier;
}

async function seedWarehouse(
    warehouse: ReturnType<typeof createConnection> extends Promise<infer T> ? T : never,
): Promise<void> {
    const fixturesDir = path.join(__dirname, 'fixtures');
    const dialectSeed = path.join(fixturesDir, `seed.${warehouse.dialect}.sql`);

    // If a dialect-specific seed has real SQL (not just comments), use it
    // instead of the base seed — some warehouses need different DDL types
    if (fs.existsSync(dialectSeed)) {
        const content = fs.readFileSync(dialectSeed, 'utf-8').trim();
        const hasStatements = content && !content.split('\n').every((l) => l.startsWith('--') || l.trim() === '');
        if (hasStatements) {
            await warehouse.seed(content);
            return;
        }
    }

    // Fall back to the generic seed
    const baseSeed = fs.readFileSync(path.join(fixturesDir, 'seed.sql'), 'utf-8');
    await warehouse.seed(baseSeed);
}

async function main() {
    const tier = parseTier(process.argv);
    const warehouses = TIER_WAREHOUSES[tier];
    const config = getWarehouseConfig();

    console.log(`Running formula tests — tier: ${tier} — warehouses: ${warehouses.join(', ')}`);

    const results: TestResult[] = [];

    for (const wh of warehouses) {
        let connection;
        try {
            connection = await createConnection(wh, config);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`Failed to connect to ${wh}: ${msg}`);
            continue;
        }

        try {
            await seedWarehouse(connection);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`Failed to seed ${wh}: ${msg}`);
            await connection.close();
            continue;
        }

        // Filter cases for this warehouse and tier
        const tierNum = tier === 'tier2' ? 2 : 1;
        const applicableCases = ALL_CASES.filter(
            (c) =>
                c.warehouses.includes(wh) &&
                (tier === 'all' || c.tier <= tierNum),
        );

        for (const testCase of applicableCases) {
            const result = await runTestCase(testCase, connection);
            results.push(result);
        }

        await connection.close();
    }

    const output = formatResults(results, ALL_CASES, tier, warehouses);
    console.log(output);

    const failed = results.filter((r) => r.status !== 'PASS');
    process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
});
