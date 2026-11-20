import { getErrorMessage } from '@lightdash/common';
import * as Excel from 'exceljs';

type WorkbookExportFile = {
    filename: string;
    sheetName?: string;
    localPath: string;
};

type CreateWorkbookFileArgs = {
    files: WorkbookExportFile[];
    outputPath: string;
    onFileError: (filename: string, error: string) => void;
};

export class WorkbookExportHelper {
    private static async loadSourceWorksheet({
        file,
        onFileError,
    }: {
        file: WorkbookExportFile;
        onFileError: (filename: string, error: string) => void;
    }) {
        try {
            const response = await fetch(file.localPath);
            if (!response.ok) {
                onFileError(
                    file.filename,
                    `HTTP ${response.status} ${response.statusText}`,
                );
                return undefined;
            }

            const buffer = Buffer.from(await response.arrayBuffer());
            const sourceWorkbook = new Excel.Workbook();
            await sourceWorkbook.xlsx.load(
                buffer as unknown as Parameters<
                    typeof sourceWorkbook.xlsx.load
                >[0],
            );

            const sourceWorksheet = sourceWorkbook.worksheets[0];
            if (!sourceWorksheet) {
                onFileError(file.filename, 'No worksheet found');
                return undefined;
            }

            return { file, sourceWorksheet };
        } catch (e) {
            onFileError(file.filename, getErrorMessage(e));
            return undefined;
        }
    }

    private static getWorksheetName(name: string, usedNames: Set<string>) {
        const fallbackName = 'Sheet';
        const sanitizedName =
            name.replace(/[:\\/?*[\]]/g, '_').trim() || fallbackName;
        const maxLength = 31;
        let sheetName = sanitizedName.slice(0, maxLength);

        if (usedNames.has(sheetName)) {
            let suffix = 2;
            do {
                const suffixText = `_${suffix}`;
                sheetName = `${sanitizedName.slice(
                    0,
                    maxLength - suffixText.length,
                )}${suffixText}`;
                suffix += 1;
            } while (usedNames.has(sheetName));
        }

        usedNames.add(sheetName);
        return sheetName;
    }

    private static copyWorksheet(
        sourceWorksheet: Excel.Worksheet,
        targetWorksheet: Excel.Worksheet,
    ) {
        sourceWorksheet.columns.forEach((column, index) => {
            if (column.width) {
                const targetColumn = targetWorksheet.getColumn(index + 1);
                targetColumn.width = column.width;
            }
        });

        sourceWorksheet.eachRow((sourceRow, rowNumber) => {
            const targetRow = targetWorksheet.getRow(rowNumber);
            targetRow.height = sourceRow.height;
            targetRow.values = sourceRow.values;

            sourceRow.eachCell(
                { includeEmpty: true },
                (sourceCell, colNumber) => {
                    const targetCell = targetRow.getCell(colNumber);
                    targetCell.value = sourceCell.value;
                    targetCell.style = { ...sourceCell.style };
                    targetCell.numFmt = sourceCell.numFmt;
                },
            );

            targetRow.commit();
        });
    }

    static async createWorkbookFile({
        files,
        outputPath,
        onFileError,
    }: CreateWorkbookFileArgs) {
        const workbook = new Excel.Workbook();
        const usedSheetNames = new Set<string>();
        const sourceWorksheets = await Promise.all(
            files.map((file) =>
                this.loadSourceWorksheet({ file, onFileError }),
            ),
        );
        const failedFileCount = sourceWorksheets.filter(
            (sourceWorksheet) => sourceWorksheet === undefined,
        ).length;

        sourceWorksheets.forEach((sourceFile) => {
            if (sourceFile) {
                const targetWorksheet = workbook.addWorksheet(
                    this.getWorksheetName(
                        sourceFile.file.sheetName ?? sourceFile.file.filename,
                        usedSheetNames,
                    ),
                );
                this.copyWorksheet(sourceFile.sourceWorksheet, targetWorksheet);
            }
        });

        if (workbook.worksheets.length === 0) {
            return {
                worksheetCount: 0,
                failedFileCount,
            };
        }

        await workbook.xlsx.writeFile(outputPath);
        return {
            worksheetCount: workbook.worksheets.length,
            failedFileCount,
        };
    }
}
