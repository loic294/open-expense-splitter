export type CsvImportField =
  | "amount"
  | "name"
  | "description"
  | "transactionDate"
  | "category"
  | "tags"
  | "currency"
  | "paidById"
  | "splitValues"
  | "splitPeople";

export type CsvColumnMapping = Record<CsvImportField, string | string[]>;

export interface ParsedCsvFile {
  headers: string[];
  rows: string[][];
}

export interface MappedCsvRow {
  amount?: string;
  name?: string;
  description?: string;
  transactionDate?: string;
  category?: string;
  tags?: string;
  currency?: string;
  paidById?: string;
  splitValues?: string;
  splitPeople?: string;
}

const expectedFields: CsvImportField[] = [
  "amount",
  "name",
  "description",
  "transactionDate",
  "category",
  "tags",
  "currency",
  "paidById",
  "splitValues",
  "splitPeople",
];

const fieldSynonyms: Record<CsvImportField, string[]> = {
  amount: ["amount", "total", "value", "cost", "price", "sum"],
  name: ["name", "title", "transaction", "merchant", "payee"],
  description: ["description", "details", "note", "memo", "comment"],
  transactionDate: ["date", "transactiondate", "spenton", "createdat"],
  category: ["category", "type", "group"],
  tags: ["tags", "tag", "labels", "keywords"],
  currency: ["currency", "coin", "curr", "monetary"],
  paidById: ["paidby", "payer", "paid_by", "member", "user"],
  splitValues: [
    "splitvalues",
    "split_values",
    "split_amounts",
    "splitamounts",
    "split_percents",
    "splitpercents",
  ],
  splitPeople: [
    "splitpeople",
    "split_people",
    "split_members",
    "splitmembers",
    "split_payers",
    "splitpayers",
  ],
};

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function emptyMapping(): CsvColumnMapping {
  return {
    amount: "",
    name: "",
    description: "",
    transactionDate: "",
    category: "",
    tags: "",
    currency: "",
    paidById: "",
    splitValues: "",
    splitPeople: "",
  };
}

export function parseCsvContent(content: string): ParsedCsvFile {
  const rows: string[][] = [];
  let currentCell = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  const flushCell = () => {
    currentRow.push(currentCell.trim());
    currentCell = "";
  };

  const flushRow = () => {
    if (currentRow.some((value) => value.length > 0)) {
      rows.push(currentRow);
    }
    currentRow = [];
  };

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentCell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      flushCell();
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      flushCell();
      flushRow();
      continue;
    }

    currentCell += char;
  }

  flushCell();
  flushRow();

  if (rows.length === 0) {
    return { headers: [], rows: [] };
  }

  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map(
    (header, index) => header || `Column ${index + 1}`,
  );

  return {
    headers,
    rows: dataRows.filter((row) =>
      row.some((value) => value.trim().length > 0),
    ),
  };
}

export function autoMatchMapping(
  headers: string[],
  saved: Partial<CsvColumnMapping> | null,
): CsvColumnMapping {
  const mapping = emptyMapping();

  expectedFields.forEach((field) => {
    const savedColumn = saved?.[field];
    if (Array.isArray(savedColumn)) {
      const matchedColumns = savedColumn.filter((column) =>
        headers.includes(column),
      );
      if (matchedColumns.length === 1) {
        mapping[field] = matchedColumns[0];
        return;
      }
      if (matchedColumns.length > 1) {
        mapping[field] = matchedColumns;
        return;
      }
    }

    if (typeof savedColumn === "string" && headers.includes(savedColumn)) {
      mapping[field] = savedColumn;
      return;
    }

    const synonyms = fieldSynonyms[field];
    const matchedHeader = headers.find((header) => {
      const normalized = normalizeHeader(header);
      return synonyms.some(
        (synonym) => normalizeHeader(synonym) === normalized,
      );
    });

    if (matchedHeader) {
      mapping[field] = matchedHeader;
    }
  });

  return mapping;
}

export function toMappedRows(
  parsed: ParsedCsvFile,
  mapping: CsvColumnMapping,
): MappedCsvRow[] {
  const headerIndex = Object.fromEntries(
    parsed.headers.map((header, index) => [header, index]),
  ) as Record<string, number>;

  return parsed.rows.map((row) => {
    const mapped: MappedCsvRow = {};

    expectedFields.forEach((field) => {
      const sourceColumn = mapping[field];
      if (!sourceColumn) {
        return;
      }

      // Handle both single column and multiple columns (array)
      const columns = Array.isArray(sourceColumn)
        ? sourceColumn
        : [sourceColumn];
      const values: string[] = [];

      columns.forEach((column) => {
        const index = headerIndex[column];
        if (typeof index === "number" && row[index]) {
          values.push(row[index]);
        }
      });

      if (values.length > 0) {
        mapped[field] = values.join(", ");
      }
    });

    return mapped;
  });
}

function sanitizeText(value: string | undefined, maxLength: number): string {
  if (!value) {
    return "";
  }

  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function sanitizeAmount(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const cleaned = value
    .replace(/\s+/g, "")
    .replace(/,/g, ".")
    .replace(/[^0-9.-]/g, "");

  if (!cleaned || cleaned === "." || cleaned === "-" || cleaned === "-.") {
    return null;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed)
    ? Math.round(Math.abs(parsed) * 100) / 100
    : null;
}

function sanitizeDate(value: string | undefined): string {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }

  const raw = value.trim();
  if (!raw) {
    return new Date().toISOString().slice(0, 10);
  }

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString().slice(0, 10);
  }

  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }

  return new Date().toISOString().slice(0, 10);
}

export function sanitizeMappedRows(rows: MappedCsvRow[]) {
  return rows
    .map((row) => {
      const amount = sanitizeAmount(row.amount);
      if (amount === null) {
        return null;
      }

      return {
        amount,
        name: sanitizeText(row.name, 120) || "Imported transaction",
        description: sanitizeText(row.description, 300),
        transactionDate: sanitizeDate(row.transactionDate),
        category: sanitizeText(row.category, 80),
        tags: sanitizeText(row.tags, 120),
        currency: sanitizeText(row.currency, 20),
        paidById: sanitizeText(row.paidById, 120),
        splitValues: sanitizeText(row.splitValues, 300),
        splitPeople: sanitizeText(row.splitPeople, 300),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}

export function importFieldLabel(field: CsvImportField): string {
  if (field === "transactionDate") {
    return "Transaction Date";
  }

  if (field === "paidById") {
    return "Paid By";
  }

  if (field === "splitValues") {
    return "Split Values";
  }

  if (field === "splitPeople") {
    return "Split People";
  }

  return field.charAt(0).toUpperCase() + field.slice(1);
}

export const csvImportFields = expectedFields;
