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
        expect(diff.trim()).toBe('');
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
        expect(diff).toContain('+          - name: new_metric');
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
        expect(diff).toContain('-          - name: old_metric');
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
        expect(diff).toContain(
            '-            description: Total number of customers',
        );
        expect(diff).toContain(
            '+            description: Total number of unique customers',
        );
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
        expect(diff).toContain(`-            sql: 'customer_id'`);
        expect(diff).toContain('+            sql: "customer_id"');
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
        expect(diff.trim()).not.toBe('');
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
        expect(diff).toContain('-                description: Unique ID');
        expect(diff).toContain(
            '+                description: Unique Identifier',
        );
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

        expect(diff).toContain('-        version: 2');
        expect(diff).toContain('+        version: 3');
        expect(diff.trim()).toContain(
            `-            description: Total number of customers`,
        );
        expect(diff.trim()).toContain(
            `+            description: Total number of unique customers`,
        );
        expect(diff).toContain('+          - name: new_metric');
    });
});
