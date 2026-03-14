type CsvValue = string | number | boolean | null | undefined;

type CsvColumn<Row> = {
  header: string;
  value: (row: Row) => CsvValue;
};

const CSV_BOM = '\uFEFF';

const escapeCsvCell = (value: CsvValue) => {
  if (value === null || value === undefined) return '';

  const normalized = String(value).replace(/\r?\n|\r/g, ' ').trim();
  const escaped = normalized.replace(/"/g, '""');

  if (/[",;]/.test(escaped)) {
    return `"${escaped}"`;
  }

  return escaped;
};

const buildCsvContent = <Row>(rows: Row[], columns: CsvColumn<Row>[]) => {
  const headerRow = columns.map((column) => escapeCsvCell(column.header)).join(';');
  const dataRows = rows.map((row) => columns.map((column) => escapeCsvCell(column.value(row))).join(';'));
  return `${CSV_BOM}${[headerRow, ...dataRows].join('\n')}`;
};

const buildTimestamp = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}_${hours}-${minutes}`;
};

export function downloadCsv<Row>(rows: Row[], columns: CsvColumn<Row>[], filePrefix: string) {
  const csvContent = buildCsvContent(rows, columns);
  const fileName = `${filePrefix}_${buildTimestamp()}.csv`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export type { CsvColumn };