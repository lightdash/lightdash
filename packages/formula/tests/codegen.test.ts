import { describe, expect, it } from 'vitest';
import { compile } from '../src/index';

const columns = { revenue: 'revenue', region: 'region' };

describe('codegen aggregateContext', () => {
    describe('SUM', () => {
        it('emits bare SUM by default', () => {
            const sql = compile('=SUM(revenue)', {
                dialect: 'postgres',
                columns,
            });
            expect(sql).toBe('SUM("revenue")');
        });

        it('emits bare SUM when aggregateContext is explicitly bare', () => {
            const sql = compile('=SUM(revenue)', {
                dialect: 'postgres',
                columns,
                aggregateContext: 'bare',
            });
            expect(sql).toBe('SUM("revenue")');
        });

        it('emits window SUM when aggregateContext is window', () => {
            const sql = compile('=SUM(revenue)', {
                dialect: 'postgres',
                columns,
                aggregateContext: 'window',
            });
            expect(sql).toBe('SUM("revenue") OVER ()');
        });
    });
});
