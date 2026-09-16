import type {
    DocumentCellOperation,
    DocumentContentV3,
} from '../types/document';
import { ParameterError } from '../types/errors';
import assertUnreachable from './assertUnreachable';
import { DOCUMENT_SCHEMA_VERSION, parseDocumentContent } from './document';

export const applyDocumentCellOperations = (
    content: DocumentContentV3,
    operations: DocumentCellOperation[],
): DocumentContentV3 => {
    if (operations.length === 0) {
        throw new ParameterError(
            'At least one Document cell operation is required',
        );
    }
    const cells = [...content.cells];
    const indexOf = (id: string) => {
        const index = cells.findIndex((cell) => cell.id === id);
        if (index < 0) {
            throw new ParameterError(`Document cell not found: ${id}`);
        }
        return index;
    };
    operations.forEach((operation) => {
        switch (operation.type) {
            case 'append':
                cells.push(operation.cell);
                break;
            case 'insert_before':
            case 'insert_after':
                cells.splice(
                    indexOf(operation.targetCellId) +
                        (operation.type === 'insert_after' ? 1 : 0),
                    0,
                    operation.cell,
                );
                break;
            case 'replace':
                if (operation.cell.id !== operation.cellId) {
                    throw new ParameterError(
                        'Replacing a Document cell must preserve its ID',
                    );
                }
                cells.splice(indexOf(operation.cellId), 1, operation.cell);
                break;
            case 'remove':
                cells.splice(indexOf(operation.cellId), 1);
                break;
            case 'move_before':
            case 'move_after': {
                if (operation.cellId === operation.targetCellId) {
                    throw new ParameterError(
                        'A Document cell cannot be moved relative to itself',
                    );
                }
                const [cell] = cells.splice(indexOf(operation.cellId), 1);
                cells.splice(
                    indexOf(operation.targetCellId) +
                        (operation.type === 'move_after' ? 1 : 0),
                    0,
                    cell,
                );
                break;
            }
            default:
                assertUnreachable(operation, 'Unknown Document cell operation');
        }
        // IDs must stay unambiguous for subsequent operations in the same batch.
        if (new Set(cells.map((cell) => cell.id)).size !== cells.length) {
            throw new ParameterError('Document cell IDs must be unique');
        }
    });
    return parseDocumentContent(DOCUMENT_SCHEMA_VERSION, { cells });
};
