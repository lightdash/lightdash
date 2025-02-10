import { GitIntegrationService } from './GitIntegrationService';

describe('GitIntegrationService.generateDiff', () => {
    it('should return an empty diff for identical files', () => {
        const original = `
        version: 2
        metrics:
          - name: unique_customer_count
            label: Unique customer count
            model: ref('customers')
            description: Total number of customers
            type: count_distinct
            sql: customer_id
        `;
        const updated = `
        version: 2
        metrics:
          - name: unique_customer_count
            label: Unique customer count
            model: ref('customers')
            description: Total number of customers
            type: count_distinct
            sql: customer_id
        `;
        const diff = GitIntegrationService.generateDiff(original, updated);
        expect(diff).toEqual([]);
    });

    it('should detect added lines', () => {
        const original = `
        version: 2
        metrics:
          - name: unique_customer_count
            label: Unique customer count
            model: ref('customers')
            description: Total number of customers
            type: count_distinct
            sql: customer_id
        `;
        const updated = `
        version: 2
        metrics:
          - name: unique_customer_count
            label: Unique customer count
            model: ref('customers')
            description: Total number of customers
            type: count_distinct
            sql: customer_id
          - name: new_metric
            label: New Metric
            model: ref('new_model')
            description: A new metric
            type: sum
            sql: new_field
        `;
        const diff = GitIntegrationService.generateDiff(original, updated);
        expect(diff).toContainEqual({
            type: 'added',
            value: "          - name: new_metric\n            label: New Metric\n            model: ref('new_model')\n            description: A new metric\n            type: sum\n            sql: new_field\n",
        });
    });

    it('should detect removed lines', () => {
        const original = `
        version: 2
        metrics:
          - name: unique_customer_count
            label: Unique customer count
            model: ref('customers')
            description: Total number of customers
            type: count_distinct
            sql: customer_id
          - name: old_metric
            label: Old Metric
            model: ref('old_model')
            description: An old metric
            type: sum
            sql: old_field
        `;
        const updated = `
        version: 2
        metrics:
          - name: unique_customer_count
            label: Unique customer count
            model: ref('customers')
            description: Total number of customers
            type: count_distinct
            sql: customer_id
        `;
        const diff = GitIntegrationService.generateDiff(original, updated);
        expect(diff).toContainEqual({
            type: 'removed',
            value: "          - name: old_metric\n            label: Old Metric\n            model: ref('old_model')\n            description: An old metric\n            type: sum\n            sql: old_field\n",
        });
    });

    it('should detect changed lines', () => {
        const original = `
        version: 2
        metrics:
          - name: unique_customer_count
            label: Unique customer count
            model: ref('customers')
            description: Total number of customers
            type: count_distinct
            sql: customer_id
        `;
        const updated = `
        version: 2
        metrics:
          - name: unique_customer_count
            label: Unique customer count
            model: ref('customers')
            description: Total number of unique customers
            type: count_distinct
            sql: customer_id
        `;
        const diff = GitIntegrationService.generateDiff(original, updated);
        expect(diff).toContainEqual({
            type: 'removed',
            value: '            description: Total number of customers\n',
        });
        expect(diff).toContainEqual({
            type: 'added',
            value: '            description: Total number of unique customers\n',
        });
    });

    it('should get diff for quoting style differences', () => {
        const original = `
        metrics:
          - name: unique_customer_count
            sql: 'customer_id'
        `;
        const updated = `
        metrics:
          - name: unique_customer_count
            sql: "customer_id"
        `;
        const diff = GitIntegrationService.generateDiff(original, updated);
        expect(diff).toContainEqual({
            type: 'removed',
            value: "            sql: 'customer_id'\n",
        });
        expect(diff).toContainEqual({
            type: 'added',
            value: '            sql: "customer_id"\n',
        });
    });

    it('should handle reordering of elements', () => {
        const original = `
        metrics:
          - name: metric_one
          - name: metric_two
        `;
        const updated = `
        metrics:
          - name: metric_two
          - name: metric_one
        `;
        const diff = GitIntegrationService.generateDiff(original, updated);
        expect(diff).not.toEqual([]);
    });

    it('should handle nested structure changes', () => {
        const original = `
        models:
          - name: customers
            columns:
              - name: customer_id
                description: Unique ID
        `;
        const updated = `
        models:
          - name: customers
            columns:
              - name: customer_id
                description: Unique Identifier
        `;
        const diff = GitIntegrationService.generateDiff(original, updated);
        expect(diff).toContainEqual({
            type: 'removed',
            value: '                description: Unique ID\n',
        });
        expect(diff).toContainEqual({
            type: 'added',
            value: '                description: Unique Identifier\n',
        });
    });

    it('should handle complex changes', () => {
        const original = `
        version: 2
        metrics:
          - name: unique_customer_count
            label: Unique customer count
            model: ref('customers')
            description: Total number of customers
            type: count_distinct
            sql: customer_id
        `;
        const updated = `
        version: 3
        metrics:
          - name: unique_customer_count
            label: Unique customer count
            model: ref('customers')
            description: Total number of unique customers
            type: count
            sql: customer_id
          - name: new_metric
            label: New Metric
            model: ref('new_model')
            description: A new metric
            type: sum
            sql: new_field
        `;
        const diff = GitIntegrationService.generateDiff(original, updated);

        expect(diff).toContainEqual({
            type: 'removed',
            value: '        version: 2\n',
        });
        expect(diff).toContainEqual({
            type: 'added',
            value: '        version: 3\n',
        });
        expect(diff).toContainEqual({
            type: 'added',
            value: "          - name: new_metric\n            label: New Metric\n            model: ref('new_model')\n            description: A new metric\n            type: sum\n            sql: new_field\n",
        });
    });
});
