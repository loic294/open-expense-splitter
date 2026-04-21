import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApiCall } from "../api";
import { useNavbarActionsTarget } from "../context/NavbarActionsContext";
import type {
  Group,
  GroupMember,
  SplitData,
  SplitType,
  Transaction,
  TransactionColumnType,
} from "../types";
import {
  autoMatchMapping,
  csvImportFields,
  importFieldLabel,
  parseCsvContent,
  sanitizeMappedRows,
  toMappedRows,
  type CsvColumnMapping,
  type CsvImportField,
  type ParsedCsvFile,
} from "../utils/csvImport";
import {
  createDefaultSplitData,
  getDateInputValue,
  memberName,
  normalizeCurrency,
  normalizeTransaction,
  splitLabel,
  SUPPORTED_CURRENCIES,
} from "../utils/spending";

function addCategory(
  category: string,
  setCategories: (updater: (prev: string[]) => string[]) => void,
) {
  if (!category) {
    return;
  }

  setCategories((prev) =>
    prev.includes(category) ? prev : [...prev, category].sort(),
  );
}

function addTags(
  tags: string,
  setTags: (updater: (prev: string[]) => string[]) => void,
) {
  const nextTags = tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  if (nextTags.length === 0) {
    return;
  }

  setTags((prev) => Array.from(new Set([...prev, ...nextTags])).sort());
}

function summarizeTransaction(transaction: Transaction) {
  return {
    id: transaction.id,
    batchId: transaction.batchId,
    amount: transaction.amount,
    name: transaction.name,
    description: transaction.description,
    transactionDate: transaction.transactionDate,
    category: transaction.category,
    tags: transaction.tags,
    paidById: transaction.paidById,
    splitType: transaction.splitType,
    splitMembers: transaction.splitData.includedMemberIds,
    splitValueCount: Object.keys(transaction.splitData.values).length,
  };
}

function memberInitial(member: GroupMember) {
  const label = memberName(member).trim();
  return label ? label[0].toUpperCase() : "U";
}

function MemberAvatar({ member }: { member: GroupMember }) {
  const initial = memberInitial(member);
  return (
    <span className="avatar">
      <span className="w-5 rounded-full bg-base-200 text-[10px] font-medium text-base-content/70 flex items-center justify-center overflow-hidden shrink-0">
        {member.picture ? (
          <img src={member.picture} alt="" aria-hidden="true" />
        ) : (
          initial
        )}
      </span>
    </span>
  );
}

function compactSplitLabel(transaction: Transaction, members: GroupMember[]) {
  const includedIds =
    transaction.splitData.includedMemberIds.length > 0
      ? transaction.splitData.includedMemberIds
      : members.map((member) => member.id);

  if (includedIds.length === 0) {
    return "Equal";
  }

  const memberById = new Map(members.map((member) => [member.id, member]));

  const shortName = (memberId: string) => {
    const member = memberById.get(memberId);
    if (member) {
      return memberInitial(member);
    }

    const fallback = memberId.trim();
    return fallback ? fallback[0].toUpperCase() : "?";
  };

  if (transaction.splitType === "percent") {
    return includedIds
      .map((memberId) => {
        const value = Math.round(
          Number(transaction.splitData.values[memberId] ?? 0),
        );
        return `${shortName(memberId)} ${value}%`;
      })
      .join(" · ");
  }

  if (transaction.splitType === "amount") {
    return includedIds
      .map((memberId) => {
        const value = Number(transaction.splitData.values[memberId] ?? 0);
        return `${shortName(memberId)} ${value.toFixed(2)}`;
      })
      .join(" · ");
  }

  const equalShare = Math.round(100 / includedIds.length);
  return includedIds
    .map((memberId) => `${shortName(memberId)} ${equalShare}%`)
    .join(" · ");
}

function PaidBySelect({
  members,
  value,
  onChange,
}: {
  members: GroupMember[];
  value: string;
  onChange: (id: string) => void;
}) {
  const selected = members.find((m) => m.id === value) ?? members[0];
  return (
    <details className="dropdown w-full">
      <summary className="btn btn-sm w-full min-w-28 justify-start gap-2 font-normal">
        {selected && (
          <>
            <MemberAvatar member={selected} />
            <span className="truncate flex-1 text-left">
              {memberName(selected)}
            </span>
          </>
        )}
      </summary>
      <ul className="dropdown-content menu bg-base-100 rounded-box z-50 w-52 p-1 shadow-lg border border-base-300">
        {members.map((member) => (
          <li key={member.id}>
            <button
              type="button"
              className={member.id === value ? "active" : ""}
              onClick={() => {
                onChange(member.id);
                (document.activeElement as HTMLElement)?.blur();
              }}
            >
              <MemberAvatar member={member} />
              <span className="truncate">{memberName(member)}</span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

function getVisibleColumns(group?: Group): TransactionColumnType[] {
  const defaults: TransactionColumnType[] = [
    "name",
    "amount",
    "currency",
    "split",
    "paid_by",
    "date",
    "category",
    "tags",
    "description",
  ];
  return group?.visibleColumns || defaults;
}

function AdvancedSplitModal({
  members,
  splitType,
  splitData,
  onSplitTypeChange,
  onMemberToggle,
  onValueChange,
  onCancel,
  onSave,
}: {
  members: GroupMember[];
  splitType: SplitType;
  splitData: SplitData;
  onSplitTypeChange: (value: SplitType) => void;
  onMemberToggle: (memberId: string) => void;
  onValueChange: (memberId: string, value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <dialog
      className="modal modal-open"
      aria-modal="true"
      aria-labelledby="split-modal-title"
    >
      <div className="modal-box max-w-2xl">
        <h3 id="split-modal-title" className="font-semibold text-lg">
          Advanced split
        </h3>
        <p className="text-sm text-base-content/70 mt-1">
          Choose who is included, then optionally set exact amounts or exact
          percentages.
        </p>

        <div className="mt-4 flex flex-col gap-4">
          <fieldset className="fieldset">
            <legend className="fieldset-legend">Split mode</legend>
            <select
              className="select select-sm w-full"
              value={splitType}
              onChange={(event) =>
                onSplitTypeChange(event.target.value as SplitType)
              }
            >
              <option value="equal">Equal split</option>
              <option value="amount">Exact amounts</option>
              <option value="percent">Exact percentages</option>
            </select>
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset-legend">Included people</legend>
            <div className="flex flex-col gap-2 rounded-md border border-base-300 p-3">
              {members.map((member) => (
                <label
                  key={member.id}
                  className="label cursor-pointer justify-start gap-3"
                >
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={splitData.includedMemberIds.includes(member.id)}
                    onChange={() => onMemberToggle(member.id)}
                  />
                  <span>{memberName(member)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {splitType !== "equal" && (
            <fieldset className="fieldset">
              <legend className="fieldset-legend">
                {splitType === "amount"
                  ? "Exact amount per person"
                  : "Exact percentage per person"}
              </legend>
              <div className="flex flex-col gap-2 rounded-md border border-base-300 p-3">
                {members
                  .filter((member) =>
                    splitData.includedMemberIds.includes(member.id),
                  )
                  .map((member) => (
                    <label key={member.id} className="flex items-center gap-3">
                      <span className="min-w-32 text-sm">
                        {memberName(member)}
                      </span>
                      <input
                        className="input input-sm w-full"
                        type="number"
                        min="0"
                        step="0.01"
                        value={splitData.values[member.id] || 0}
                        onChange={(event) =>
                          onValueChange(member.id, event.target.value)
                        }
                      />
                    </label>
                  ))}
              </div>
            </fieldset>
          )}
        </div>

        <div className="modal-action">
          <button type="button" className="btn btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={onSave}
          >
            Save split
          </button>
        </div>
      </div>
    </dialog>
  );
}

function SplitQuickSelectPopover({
  transaction,
  members,
  position,
  placement,
  onMemberToggle,
  onOpenAdvanced,
  onMouseEnter,
  onMouseLeave,
}: {
  transaction: Transaction;
  members: GroupMember[];
  position: { top: number; left: number };
  placement: "above" | "below";
  onMemberToggle: (memberId: string) => void;
  onOpenAdvanced: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  return createPortal(
    <div
      className="pointer-events-none fixed z-50"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        transform: placement === "above" ? "translateY(-100%)" : undefined,
      }}
    >
      <div
        className="pointer-events-auto card card-border w-72 bg-base-100 shadow-lg"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <div className="card-body gap-3 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Included people</h3>
              <p className="text-xs text-base-content/70 capitalize">
                {transaction.splitType} split
              </p>
            </div>
            <button
              type="button"
              className="btn btn-xs btn-ghost"
              onClick={onOpenAdvanced}
            >
              Advanced
            </button>
          </div>

          <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
            {members.map((member) => {
              const included = transaction.splitData.includedMemberIds.includes(
                member.id,
              );

              return (
                <label
                  key={member.id}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-base-300 px-2 py-1.5 hover:bg-base-200"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <MemberAvatar member={member} />
                    <span className="truncate text-sm">
                      {memberName(member)}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={included}
                    onChange={() => onMemberToggle(member.id)}
                  />
                </label>
              );
            })}
          </div>

          <p className="text-xs text-base-content/60">
            Hover here to keep editing. Click the split value for exact amounts
            or percentages.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CsvImportModal({
  fileName,
  parsed,
  mapping,
  previewRows,
  validCount,
  invalidCount,
  isImporting,
  onChangeMapping,
  onCancel,
  onImport,
  groupMembers,
  paidByIdMapping,
  onPaidByIdMappingChange,
  emojiMap,
}: {
  fileName: string;
  parsed: ParsedCsvFile;
  mapping: CsvColumnMapping;
  previewRows: Array<{
    amount: number;
    name: string;
    description: string;
    transactionDate: string;
    category: string;
    tags: string;
    currency: string;
    paidById: string;
    splitValues: string;
    splitPeople: string;
  }>;
  validCount: number;
  invalidCount: number;
  isImporting: boolean;
  onChangeMapping: (
    field: CsvImportField,
    columns: string | string[] | null,
  ) => void;
  onCancel: () => void;
  onImport: () => void;
  groupMembers: GroupMember[];
  paidByIdMapping: Record<string, string>;
  onPaidByIdMappingChange: (csvValue: string, memberId: string) => void;
  emojiMap: {
    category: Record<string, string>;
    tag: Record<string, string>;
  };
}) {
  const buildSelectedColumns = useCallback(
    (currentMapping: CsvColumnMapping) => {
      const result = {} as Record<CsvImportField, string[]>;
      csvImportFields.forEach((field) => {
        const value = currentMapping[field];
        if (Array.isArray(value)) {
          result[field] = value.length > 0 ? value : [""];
        } else if (typeof value === "string" && value) {
          result[field] = [value];
        } else {
          result[field] = [""];
        }
      });
      return result;
    },
    [],
  );

  const [selectedColumns, setSelectedColumns] = useState<
    Record<CsvImportField, string[]>
  >(() => buildSelectedColumns(mapping));

  useEffect(() => {
    setSelectedColumns(buildSelectedColumns(mapping));
  }, [buildSelectedColumns, mapping]);

  const commitFieldMapping = useCallback(
    (field: CsvImportField, columns: string[]) => {
      const normalized = columns
        .map((column) => column.trim())
        .filter(
          (column, index, values) =>
            column.length > 0 && values.indexOf(column) === index,
        );

      const nextValue =
        normalized.length === 0
          ? null
          : normalized.length === 1
            ? normalized[0]
            : normalized;

      onChangeMapping(field, nextValue);
    },
    [onChangeMapping],
  );

  const updateFieldSelection = useCallback(
    (field: CsvImportField, index: number, column: string) => {
      setSelectedColumns((prev) => {
        const nextSelections = [...prev[field]];
        nextSelections[index] = column;

        commitFieldMapping(field, nextSelections);

        return {
          ...prev,
          [field]: nextSelections,
        };
      });
    },
    [commitFieldMapping],
  );

  const addFieldSelection = useCallback((field: CsvImportField) => {
    setSelectedColumns((prev) => ({
      ...prev,
      [field]: [...prev[field], ""],
    }));
  }, []);

  const removeFieldSelection = useCallback(
    (field: CsvImportField, index: number) => {
      setSelectedColumns((prev) => {
        const nextSelections = prev[field].filter(
          (_, itemIndex) => itemIndex !== index,
        );
        const normalizedSelections =
          nextSelections.length > 0 ? nextSelections : [""];

        commitFieldMapping(field, normalizedSelections);

        return {
          ...prev,
          [field]: normalizedSelections,
        };
      });
    },
    [commitFieldMapping],
  );

  const isHeaderUsedForField = useCallback(
    (field: CsvImportField, header: string, currentIndex: number) =>
      selectedColumns[field].some(
        (selectedHeader, index) =>
          index !== currentIndex && selectedHeader === header,
      ),
    [selectedColumns],
  );

  const uniquePaidByValues = useMemo(() => {
    const values = new Set<string>();
    previewRows.forEach((row) => {
      if (row.paidById) {
        values.add(row.paidById);
      }
    });
    return Array.from(values).sort();
  }, [previewRows]);

  const getPreviewSplitLabel = useCallback(
    (row: (typeof previewRows)[number]) => {
      const valuesRaw = row.splitValues?.trim();
      const peopleRaw = row.splitPeople?.trim();
      if (!valuesRaw && !peopleRaw) {
        return "Equal";
      }

      const values = valuesRaw
        ? valuesRaw
            .split(";")
            .map((value) => value.trim())
            .filter(Boolean)
        : [];

      const people = peopleRaw
        ? peopleRaw
            .split(";")
            .map((person) => person.trim())
            .filter(Boolean)
        : [];

      const mappedPeople = people.map((csvPerson) => {
        const mappedMemberId = paidByIdMapping[csvPerson] || "";
        if (!mappedMemberId) {
          return `Unmapped:${csvPerson}`;
        }
        const member = groupMembers.find((m) => m.id === mappedMemberId);
        return member ? memberName(member) : `Unmapped:${csvPerson}`;
      });

      if (values.length > 0 && mappedPeople.length > 0) {
        const pairs = mappedPeople.map((person, index) => {
          const value = values[index] || "?";
          return `${person} ${value}`;
        });
        return pairs.join("; ");
      }

      if (mappedPeople.length > 0) {
        return mappedPeople.join("; ");
      }

      if (values.length > 0) {
        return values.join("; ");
      }

      return "Equal";
    },
    [groupMembers, paidByIdMapping],
  );

  const getPreviewPaidByLabel = useCallback(
    (csvPaidByValue: string) => {
      const mappedMemberId = paidByIdMapping[csvPaidByValue] || "";
      if (!mappedMemberId) {
        return "Not mapped";
      }
      const member = groupMembers.find((m) => m.id === mappedMemberId);
      return member ? memberName(member) : "Not mapped";
    },
    [groupMembers, paidByIdMapping],
  );

  return (
    <dialog
      className="modal modal-open"
      aria-modal="true"
      aria-labelledby="csv-modal-title"
    >
      <div className="modal-box max-w-6xl">
        <h3 id="csv-modal-title" className="font-semibold text-lg">
          Import transactions from CSV
        </h3>
        <p className="text-sm text-base-content/70 mt-1">
          {fileName} • {parsed.rows.length} row(s) detected
        </p>

        <div className="mt-4 flex flex-col gap-4">
          <div className="alert alert-info alert-soft p-3">
            <div className="text-sm">
              <p className="font-medium mb-2">Split Format (Optional)</p>
              <p className="text-xs text-base-content/80">
                To set up expense splits, map two columns:
              </p>
              <ul className="text-xs text-base-content/80 mt-2 ml-4 list-disc space-y-1">
                <li>
                  <strong>Split Values:</strong> Amounts or percentages
                  separated by ";" (e.g., "10; 20; 15" or "50%; 30%; 20%")
                </li>
                <li>
                  <strong>Split People:</strong> Names/emails matching your
                  member mapping, separated by ";" (e.g., "Alice; Bob; Charlie")
                </li>
              </ul>
              <p className="text-xs text-base-content/70 mt-2">
                If no split is mapped, all transactions will use equal split.
              </p>
            </div>
          </div>

          <div className="card card-border bg-base-100">
            <div className="card-body p-4 gap-3">
              <h4 className="font-semibold">Field mapping</h4>
              <p className="text-xs text-base-content/70">
                Choose one primary column per field, then add optional extra
                mappings. Extra mapped values are combined with ", ".
              </p>
              <div className="grid gap-4 md:grid-cols-3">
                {csvImportFields.map((field) => (
                  <div
                    key={field}
                    className="fieldset rounded-md border border-base-300 p-3"
                  >
                    <label className="fieldset-legend">
                      {importFieldLabel(field)}
                    </label>
                    <div className="flex flex-col gap-2">
                      {selectedColumns[field].map((selectedColumn, index) => (
                        <div
                          key={`${field}-${index}`}
                          className="flex items-center gap-2"
                        >
                          <select
                            className="select select-sm w-full"
                            value={selectedColumn}
                            onChange={(event) =>
                              updateFieldSelection(
                                field,
                                index,
                                event.target.value,
                              )
                            }
                          >
                            <option value="">
                              {index === 0
                                ? "Select a column"
                                : "Select another column"}
                            </option>
                            {parsed.headers.map((header) => (
                              <option
                                key={header}
                                value={header}
                                disabled={isHeaderUsedForField(
                                  field,
                                  header,
                                  index,
                                )}
                              >
                                {header}
                              </option>
                            ))}
                          </select>
                          {index > 0 && (
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost btn-square"
                              onClick={() => removeFieldSelection(field, index)}
                              aria-label={`Remove extra mapping for ${importFieldLabel(field)}`}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                      {parsed.headers.length === 0 && (
                        <p className="text-xs text-base-content/50">
                          No columns available
                        </p>
                      )}
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost self-start"
                        onClick={() => addFieldSelection(field)}
                        disabled={
                          parsed.headers.length === 0 ||
                          selectedColumns[field].filter(Boolean).length >=
                            parsed.headers.length
                        }
                      >
                        Add another mapping
                      </button>
                    </div>
                    {selectedColumns[field].filter(Boolean).length > 0 && (
                      <p className="text-xs text-base-content/70 mt-1">
                        Mapped from:{" "}
                        {selectedColumns[field].filter(Boolean).join(", ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card card-border bg-base-100">
            <div className="card-body p-4 gap-3">
              <h4 className="font-semibold">
                Member mapping
                {uniquePaidByValues.length > 0 && (
                  <span className="text-xs text-base-content/70 ml-1">
                    ({uniquePaidByValues.length})
                  </span>
                )}
              </h4>
              <p className="text-xs text-base-content/70">
                Map CSV values from the "Paid by" field to group members.
              </p>
              {uniquePaidByValues.length > 0 ? (
                <div className="flex flex-col gap-2 max-h-56 overflow-y-auto">
                  {uniquePaidByValues.map((csvValue) => (
                    <div key={csvValue} className="flex flex-col gap-1">
                      <p className="text-xs font-medium truncate">
                        "{csvValue}"
                      </p>
                      <select
                        className="select select-sm"
                        value={paidByIdMapping[csvValue] || ""}
                        onChange={(e) =>
                          onPaidByIdMappingChange(csvValue, e.target.value)
                        }
                      >
                        <option value="">Not mapped</option>
                        {groupMembers.map((member) => (
                          <option key={member.id} value={member.id}>
                            {memberName(member)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-base-content/50">
                  No payer data found in CSV. Map a "Paid by" column above.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 card card-border bg-base-100">
          <div className="card-body p-4 gap-3">
            <h4 className="font-semibold">Sanitized preview</h4>
            <p className="text-xs text-base-content/70">
              {validCount} valid row(s) ready, {invalidCount} row(s) skipped.
            </p>
            <div className="overflow-x-auto rounded-md border border-base-300">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Amount</th>
                    <th>Currency</th>
                    <th>Name</th>
                    <th>Description</th>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Tags</th>
                    <th>Split</th>
                    <th>Paid by</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, 6).map((row, index) => {
                    return (
                      <tr key={`${row.name}-${index}`}>
                        <td>{row.amount.toFixed(2)}</td>
                        <td>{row.currency || "-"}</td>
                        <td className="truncate max-w-xs">{row.name}</td>
                        <td className="truncate max-w-xs">
                          {row.description || "-"}
                        </td>
                        <td>{row.transactionDate}</td>
                        <td>
                          {row.category ? (
                            <div className="flex items-center gap-1">
                              {emojiMap.category[row.category] && (
                                <span className="text-base">
                                  {emojiMap.category[row.category]}
                                </span>
                              )}
                              {row.category}
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {row.tags
                              ? row.tags
                                  .split(",")
                                  .map((tag) => tag.trim())
                                  .filter(Boolean)
                                  .map((tag) => (
                                    <span key={tag} className="badge badge-xs">
                                      {emojiMap.tag[tag] && (
                                        <span>{emojiMap.tag[tag]}</span>
                                      )}
                                      {tag}
                                    </span>
                                  ))
                              : "-"}
                          </div>
                        </td>
                        <td className="truncate max-w-xs">
                          {getPreviewSplitLabel(row)}
                        </td>
                        <td>{getPreviewPaidByLabel(row.paidById)}</td>
                      </tr>
                    );
                  })}
                  {previewRows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center text-sm">
                        No valid rows to import with current mapping.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="modal-action">
          <button type="button" className="btn btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={isImporting || validCount === 0}
            onClick={onImport}
          >
            {isImporting ? "Importing..." : "Import"}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default function TransactionSection({
  group,
  onTransactionsChange,
  externalTransaction,
}: {
  group: Group;
  onTransactionsChange?: (transactions: Transaction[]) => void;
  externalTransaction?: Transaction | null;
}) {
  const apiCall = useApiCall();
  const navbarTarget = useNavbarActionsTarget();
  const saveTimersRef = useRef<Record<string, number>>({});
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const splitButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const splitPopoverCloseTimerRef = useRef<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [emojiMap, setEmojiMap] = useState<{
    category: Record<string, string>;
    tag: Record<string, string>;
  }>({
    category: {},
    tag: {},
  });
  const [loadingData, setLoadingData] = useState(false);
  const [savingTransactions, setSavingTransactions] = useState<
    Record<string, boolean>
  >({});
  const [activeSplitTransactionId, setActiveSplitTransactionId] = useState<
    string | null
  >(null);
  const [splitPopover, setSplitPopover] = useState<{
    transactionId: string;
    position: { top: number; left: number };
    placement: "above" | "below";
  } | null>(null);
  const [splitEditor, setSplitEditor] = useState<{
    splitType: SplitType;
    splitData: SplitData;
  } | null>(null);
  const [savedImportMapping, setSavedImportMapping] =
    useState<Partial<CsvColumnMapping> | null>(null);
  const [paidByIdMapping, setPaidByIdMapping] = useState<
    Record<string, string>
  >({});
  const [importState, setImportState] = useState<{
    fileName: string;
    parsed: ParsedCsvFile;
    mapping: CsvColumnMapping;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importingCsv, setImportingCsv] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    transactionId: string;
    transactionName: string;
  } | null>(null);
  const [bulkDeleteConfirmation, setBulkDeleteConfirmation] = useState<
    number | null
  >(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [bulkUpdateField, setBulkUpdateField] = useState<
    | "category"
    | "paidById"
    | "currency"
    | "splitType"
    | "date"
    | "tags"
    | "description"
    | null
  >(null);
  const [bulkUpdateValue, setBulkUpdateValue] = useState<string>("");
  const [newCategoryDialog, setNewCategoryDialog] = useState<{
    open: boolean;
    inputValue: string;
    transactionId: string | null;
  }>({ open: false, inputValue: "", transactionId: null });
  const [newTagDialog, setNewTagDialog] = useState<{
    open: boolean;
    inputValue: string;
    transactionId: string | null;
  }>({ open: false, inputValue: "", transactionId: null });

  const [sortField, setSortField] = useState<
    | "name"
    | "amount"
    | "currency"
    | "paidById"
    | "transactionDate"
    | "category"
    | "description"
  >("transactionDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const sortedTransactions = useMemo(() => {
    const sorted = [...transactions];
    sorted.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      if (sortField === "transactionDate") {
        aValue = new Date(a.transactionDate).getTime();
        bValue = new Date(b.transactionDate).getTime();
      } else if (sortField === "amount") {
        aValue = a.amount;
        bValue = b.amount;
      } else if (sortField === "paidById") {
        const aMember = group.members.find((m) => m.id === a.paidById);
        const bMember = group.members.find((m) => m.id === b.paidById);
        aValue = aMember ? memberName(aMember) : a.paidById;
        bValue = bMember ? memberName(bMember) : b.paidById;
      } else {
        aValue = a[sortField as keyof Transaction] || "";
        bValue = b[sortField as keyof Transaction] || "";
      }

      if (aValue < bValue) {
        return sortDirection === "asc" ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortDirection === "asc" ? 1 : -1;
      }
      return 0;
    });
    return sorted;
  }, [transactions, sortField, sortDirection, group.members]);

  useEffect(() => {
    onTransactionsChange?.(transactions);
  }, [transactions, onTransactionsChange]);

  useEffect(() => {
    if (!externalTransaction) {
      return;
    }

    if (externalTransaction.batchId !== group.id) {
      return;
    }

    setTransactions((prev) => {
      const exists = prev.some((item) => item.id === externalTransaction.id);
      return exists ? prev : [externalTransaction, ...prev];
    });
    addCategory(externalTransaction.category, setCategories);
    addTags(externalTransaction.tags, setTags);
  }, [externalTransaction, group.id]);

  const activeSplitTransaction =
    transactions.find(
      (transaction) => transaction.id === activeSplitTransactionId,
    ) || null;
  const categoryListId = `category-options-${group.id}`;
  const tagListId = `tag-options-${group.id}`;
  const mappedRows = useMemo(() => {
    if (!importState) {
      return [];
    }

    return toMappedRows(importState.parsed, importState.mapping);
  }, [importState]);

  const sanitizedRows = useMemo(
    () => sanitizeMappedRows(mappedRows),
    [mappedRows],
  );

  const clearTransactionTimer = (transactionId: string) => {
    const timer = saveTimersRef.current[transactionId];
    if (timer) {
      window.clearTimeout(timer);
      delete saveTimersRef.current[transactionId];
    }
  };

  useEffect(() => {
    return () => {
      Object.keys(saveTimersRef.current).forEach(clearTransactionTimer);
      if (splitPopoverCloseTimerRef.current) {
        window.clearTimeout(splitPopoverCloseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setActiveSplitTransactionId(null);
    setSplitPopover(null);
    setSplitEditor(null);
    setImportState(null);
    setPaidByIdMapping({});
    setImportError(null);
  }, [group.id]);

  useEffect(() => {
    if (!splitPopover) {
      return;
    }

    const dismissPopover = () => {
      setSplitPopover(null);
    };

    window.addEventListener("scroll", dismissPopover, true);
    window.addEventListener("resize", dismissPopover);

    return () => {
      window.removeEventListener("scroll", dismissPopover, true);
      window.removeEventListener("resize", dismissPopover);
    };
  }, [splitPopover]);

  useEffect(() => {
    const fetchSavedMapping = async () => {
      try {
        const data = await apiCall("/api/spendings/import-mapping");
        const nextMapping =
          data.mapping && typeof data.mapping === "object"
            ? (data.mapping as Partial<CsvColumnMapping>)
            : null;
        setSavedImportMapping(nextMapping);
      } catch (error) {
        console.error("[transactions] import mapping fetch failed", error);
      }
    };

    fetchSavedMapping();
  }, [apiCall]);

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        setLoadingData(true);
        console.debug("[transactions] fetch start", {
          groupId: group.id,
        });
        const data = await apiCall(
          `/api/spendings?batchId=${encodeURIComponent(group.id)}`,
        );
        const nextTransactions = ((data.spendings || []) as any[]).map(
          (transaction) => normalizeTransaction(transaction, group),
        );
        setTransactions(nextTransactions);
        setCategories((data.categories || []) as string[]);
        setTags(
          Array.from(
            new Set(
              nextTransactions.flatMap((transaction) =>
                transaction.tags
                  .split(",")
                  .map((tag) => tag.trim())
                  .filter(Boolean),
              ),
            ),
          ).sort(),
        );

        // Fetch emojis for categories and tags
        try {
          const emojiData = await apiCall(
            `/api/batches/${encodeURIComponent(group.id)}/emojis`,
          );
          setEmojiMap(emojiData);
        } catch (error) {
          console.error("[transactions] emoji fetch failed", error);
        }

        console.debug("[transactions] fetch success", {
          groupId: group.id,
          total: (data.spendings || []).length,
          categories: (data.categories || []).length,
        });
      } catch (error) {
        console.error("[transactions] fetch failed", {
          groupId: group.id,
          error,
        });
      } finally {
        setLoadingData(false);
      }
    };

    fetchTransactions();
  }, [apiCall, group]);

  const persistTransaction = async (
    transaction: Transaction,
    mode: "patch" | "create" = "patch",
  ) => {
    setSavingTransactions((prev) => ({ ...prev, [transaction.id]: true }));
    console.debug("[transactions] persist start", {
      mode,
      transaction: summarizeTransaction(transaction),
    });

    try {
      if (mode === "create") {
        const response = await apiCall("/api/spendings", {
          method: "POST",
          body: JSON.stringify({
            batchId: transaction.batchId,
            amount: transaction.amount,
            currency: transaction.currency,
            name: transaction.name,
            description: transaction.description,
            transactionDate: transaction.transactionDate,
            category: transaction.category,
            tags: transaction.tags,
            paidById: transaction.paidById,
            splitType: transaction.splitType,
            splitData: transaction.splitData,
          }),
        });

        console.debug("[transactions] create response", {
          draftId: transaction.id,
          createdId: response.spending?.id || response.id,
          hasSpending: !!response.spending,
        });

        if (response.spending) {
          const normalized = normalizeTransaction(response.spending, group);
          setTransactions((prev) => [normalized, ...prev]);
          addCategory(normalized.category, setCategories);
          addTags(normalized.tags, setTags);
          console.debug("[transactions] create stored", {
            transaction: summarizeTransaction(normalized),
          });
        }
      } else {
        const response = await apiCall(`/api/spendings/${transaction.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            batchId: transaction.batchId,
            amount: transaction.amount,
            currency: transaction.currency,
            name: transaction.name,
            description: transaction.description,
            transactionDate: transaction.transactionDate,
            category: transaction.category,
            tags: transaction.tags,
            paidById: transaction.paidById,
            splitType: transaction.splitType,
            splitData: transaction.splitData,
          }),
        });

        const normalized = normalizeTransaction(response, group);
        console.debug("[transactions] patch response", {
          requestedId: transaction.id,
          returnedId: normalized.id,
          transaction: summarizeTransaction(normalized),
        });
        setTransactions((prev) =>
          prev.map((item) => (item.id === normalized.id ? normalized : item)),
        );
        addCategory(normalized.category, setCategories);
        addTags(normalized.tags, setTags);
      }
    } catch (error) {
      console.error("[transactions] persist failed", {
        mode,
        transaction: summarizeTransaction(transaction),
        error,
      });
    } finally {
      setSavingTransactions((prev) => ({ ...prev, [transaction.id]: false }));
      console.debug("[transactions] persist end", {
        mode,
        transactionId: transaction.id,
      });
    }
  };

  const scheduleTransactionSave = (transaction: Transaction) => {
    clearTransactionTimer(transaction.id);
    console.debug("[transactions] schedule save", {
      transactionId: transaction.id,
      delayMs: 350,
      transaction: summarizeTransaction(transaction),
    });
    saveTimersRef.current[transaction.id] = window.setTimeout(() => {
      console.debug("[transactions] debounce fired", {
        transactionId: transaction.id,
      });
      persistTransaction(transaction);
    }, 350);
  };

  const updateTransactionLocal = (
    transactionId: string,
    updater: (transaction: Transaction) => Transaction,
  ) => {
    const current = transactions.find((t) => t.id === transactionId);
    if (!current) return;

    const nextTransaction = updater(current);

    console.debug("[transactions] local update", {
      transactionId,
      before: summarizeTransaction(current),
      after: summarizeTransaction(nextTransaction),
    });

    setTransactions((prev) =>
      prev.map((t) => (t.id === transactionId ? nextTransaction : t)),
    );
  };

  const updateTransaction = (
    transactionId: string,
    updater: (transaction: Transaction) => Transaction,
  ) => {
    const current = transactions.find((t) => t.id === transactionId);
    if (!current) return;

    const nextTransaction = updater(current);

    console.debug("[transactions] local update and schedule save", {
      transactionId,
      before: summarizeTransaction(current),
      after: summarizeTransaction(nextTransaction),
    });

    setTransactions((prev) =>
      prev.map((t) => (t.id === transactionId ? nextTransaction : t)),
    );

    scheduleTransactionSave(nextTransaction);
  };

  const clearSplitPopoverCloseTimer = () => {
    if (splitPopoverCloseTimerRef.current) {
      window.clearTimeout(splitPopoverCloseTimerRef.current);
      splitPopoverCloseTimerRef.current = null;
    }
  };

  const scheduleSplitPopoverClose = () => {
    clearSplitPopoverCloseTimer();
    splitPopoverCloseTimerRef.current = window.setTimeout(() => {
      setSplitPopover(null);
    }, 120);
  };

  const openSplitPopover = (transactionId: string) => {
    clearSplitPopoverCloseTimer();

    const anchor = splitButtonRefs.current[transactionId];
    if (!anchor) {
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const width = 288;
    const margin = 8;
    const preferAbove =
      window.innerHeight - rect.bottom < 260 && rect.top > 260;
    const left = Math.min(
      Math.max(margin, rect.left),
      Math.max(margin, window.innerWidth - width - margin),
    );

    setSplitPopover({
      transactionId,
      position: {
        top: preferAbove ? rect.top - margin : rect.bottom + margin,
        left,
      },
      placement: preferAbove ? "above" : "below",
    });
  };

  const openAdvancedSplitEditor = (transaction: Transaction) => {
    setSplitPopover(null);
    setActiveSplitTransactionId(transaction.id);
    setSplitEditor({
      splitType: transaction.splitType,
      splitData: {
        includedMemberIds: [...transaction.splitData.includedMemberIds],
        values: { ...transaction.splitData.values },
      },
    });
  };

  const toggleTransactionSplitMember = (
    transactionId: string,
    memberId: string,
  ) => {
    updateTransaction(transactionId, (transaction) => {
      const includedMemberIds =
        transaction.splitData.includedMemberIds.includes(memberId)
          ? transaction.splitData.includedMemberIds.filter(
              (id) => id !== memberId,
            )
          : [...transaction.splitData.includedMemberIds, memberId];

      return {
        ...transaction,
        splitData: {
          ...transaction.splitData,
          includedMemberIds,
          values: {
            ...transaction.splitData.values,
            [memberId]: transaction.splitData.values[memberId] ?? 0,
          },
        },
      };
    });
  };

  const createTransaction = async () => {
    const memberIds = group.members.map((member) => member.id);
    const defaultDate = transactions[0]?.transactionDate || getDateInputValue();
    const defaultPayer = memberIds[0] || "";
    const transaction: Transaction = {
      id: `draft_${Date.now()}`,
      batchId: group.id,
      amount: 0,
      currency: "USD",
      name: "",
      description: "",
      transactionDate: defaultDate,
      category: "",
      tags: "",
      paidById: defaultPayer,
      splitType: "equal",
      splitData: createDefaultSplitData(memberIds),
    };

    console.debug("[transactions] create draft", {
      groupId: group.id,
      transaction: summarizeTransaction(transaction),
    });

    await persistTransaction(transaction, "create");
  };

  const saveAdvancedSplit = () => {
    if (!activeSplitTransactionId || !splitEditor) {
      return;
    }

    updateTransaction(activeSplitTransactionId, (transaction) => ({
      ...transaction,
      splitType: splitEditor.splitType,
      splitData: splitEditor.splitData,
    }));
    setActiveSplitTransactionId(null);
    setSplitEditor(null);
  };

  const openCsvPicker = () => {
    setImportError(null);
    csvInputRef.current?.click();
  };

  const handleCsvSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const content = await file.text();
      const parsed = parseCsvContent(content);

      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setImportError("CSV is empty or has an invalid format.");
        return;
      }

      const mapping = autoMatchMapping(parsed.headers, savedImportMapping);
      setImportState({
        fileName: file.name,
        parsed,
        mapping,
      });
      setImportError(null);
    } catch (error) {
      console.error("[transactions] csv parse failed", error);
      setImportError("Failed to parse the CSV file.");
    }
  };

  const deleteTransaction = async (transactionId: string) => {
    setSavingTransactions((prev) => ({ ...prev, [transactionId]: true }));
    try {
      await apiCall(`/api/spendings/${transactionId}`, { method: "DELETE" });
      setTransactions((prev) => prev.filter((t) => t.id !== transactionId));
    } catch (error) {
      console.error("[transactions] delete failed", { transactionId, error });
    } finally {
      setSavingTransactions((prev) => ({ ...prev, [transactionId]: false }));
      setDeleteConfirmation(null);
    }
  };

  const deleteBulkTransactions = async () => {
    if (selectedRowIds.size === 0) {
      return;
    }

    try {
      selectedRowIds.forEach((transactionId) => {
        setSavingTransactions((prev) => ({ ...prev, [transactionId]: true }));
      });

      const deletePromises = Array.from(selectedRowIds).map((transactionId) =>
        apiCall(`/api/spendings/${transactionId}`, { method: "DELETE" }),
      );

      await Promise.all(deletePromises);

      setTransactions((prev) => prev.filter((t) => !selectedRowIds.has(t.id)));

      console.debug("[transactions] bulk delete success", {
        count: selectedRowIds.size,
      });
    } catch (error) {
      console.error("[transactions] bulk delete failed", {
        count: selectedRowIds.size,
        error,
      });
    } finally {
      selectedRowIds.forEach((transactionId) => {
        setSavingTransactions((prev) => ({ ...prev, [transactionId]: false }));
      });
      setSelectedRowIds(new Set());
      setBulkDeleteConfirmation(null);
    }
  };

  const handleImport = async () => {
    if (!importState) {
      return;
    }

    if (!importState.mapping.amount) {
      setImportError("The Amount field must be mapped before import.");
      return;
    }

    if (sanitizedRows.length === 0) {
      setImportError("No valid rows were found after sanitization.");
      return;
    }

    try {
      setImportingCsv(true);
      setImportError(null);

      // Apply paidByIdMapping to rows
      const rowsWithMappedMembers = sanitizedRows.map((row) => {
        if (row.paidById && paidByIdMapping[row.paidById]) {
          return {
            ...row,
            paidById: paidByIdMapping[row.paidById],
          };
        }
        return row;
      });

      const importedResult = await apiCall("/api/spendings/import", {
        method: "POST",
        body: JSON.stringify({
          batchId: group.id,
          rows: rowsWithMappedMembers,
          paidByIdMapping: paidByIdMapping,
        }),
      });

      try {
        await apiCall("/api/spendings/import-mapping", {
          method: "PUT",
          body: JSON.stringify({ mapping: importState.mapping }),
        });
        setSavedImportMapping(importState.mapping);
      } catch (error) {
        console.error("[transactions] import mapping save failed", error);
      }

      const imported = ((importedResult.imported || []) as any[]).map((row) =>
        normalizeTransaction(row, group),
      );

      setTransactions((prev) => {
        const existing = new Set(prev.map((item) => item.id));
        const deduped = imported.filter((item) => !existing.has(item.id));
        return [...deduped, ...prev];
      });

      imported.forEach((item) => addCategory(item.category, setCategories));
      imported.forEach((item) => addTags(item.tags, setTags));
      setImportState(null);
      setPaidByIdMapping({});
    } catch (error) {
      console.error("[transactions] csv import failed", error);
      setImportError(
        error instanceof Error ? error.message : "Failed to import CSV.",
      );
    } finally {
      setImportingCsv(false);
    }
  };

  return (
    <>
      {navbarTarget &&
        createPortal(
          <div className="join">
            <button
              type="button"
              className="btn btn-sm join-item"
              onClick={openCsvPicker}
            >
              Import CSV
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary join-item"
              onClick={createTransaction}
            >
              New expense
            </button>
          </div>,
          navbarTarget,
        )}
      <section className="card card-border bg-base-100 rounded-md w-full shadow-sm">
        <div className="card-body p-3 md:p-4 gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">{group.emoji}</span>
            <div>
              <h2 className="card-title text-base">{group.name}</h2>
              <p className="text-sm text-base-content/70">
                {group.members.length} member(s)
              </p>
            </div>
          </div>
          {importError && (
            <div className="alert alert-error alert-soft text-sm">
              <span>{importError}</span>
            </div>
          )}
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleCsvSelected}
          />
        </div>
      </section>

      <section className="card card-border bg-base-100 rounded-md w-full shadow-sm">
        <div className="card-body p-3 md:p-4 gap-3">
          <h2 className="card-title text-base">Transactions</h2>
          {selectedRowIds.size > 0 && (
            <div className="alert alert-info alert-soft gap-3">
              <div className="flex-1">
                <span className="font-semibold">
                  {selectedRowIds.size} row
                  {selectedRowIds.size !== 1 ? "s" : ""} selected
                </span>
              </div>
              <div className="flex flex-col md:flex-row gap-2 items-end">
                <div className="flex gap-2 w-full md:w-auto">
                  <select
                    className="select select-sm flex-1"
                    value={bulkUpdateField || ""}
                    onChange={(event) =>
                      setBulkUpdateField(
                        (event.target.value as
                          | "category"
                          | "paidById"
                          | "currency"
                          | "splitType"
                          | "date"
                          | "tags"
                          | "description") || null,
                      )
                    }
                  >
                    <option value="">Select field to update...</option>
                    <option value="category">Category</option>
                    <option value="paidById">Paid by</option>
                    <option value="currency">Currency</option>
                    <option value="splitType">Split type</option>
                    <option value="date">Date</option>
                    <option value="tags">Tags</option>
                    <option value="description">Description</option>
                  </select>
                </div>
                {bulkUpdateField === "category" && (
                  <input
                    type="text"
                    className="input input-sm flex-1"
                    placeholder="New category"
                    value={bulkUpdateValue}
                    onChange={(event) => setBulkUpdateValue(event.target.value)}
                  />
                )}
                {bulkUpdateField === "paidById" && (
                  <select
                    className="select select-sm flex-1"
                    value={bulkUpdateValue}
                    onChange={(event) => setBulkUpdateValue(event.target.value)}
                  >
                    <option value="">Select who paid...</option>
                    {group.members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {memberName(member)}
                      </option>
                    ))}
                  </select>
                )}
                {bulkUpdateField === "currency" && (
                  <select
                    className="select select-sm flex-1"
                    value={bulkUpdateValue}
                    onChange={(event) => setBulkUpdateValue(event.target.value)}
                  >
                    <option value="">Select currency...</option>
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                )}
                {bulkUpdateField === "splitType" && (
                  <select
                    className="select select-sm flex-1"
                    value={bulkUpdateValue}
                    onChange={(event) => setBulkUpdateValue(event.target.value)}
                  >
                    <option value="">Select split type...</option>
                    <option value="equal">Equal split</option>
                    <option value="amount">Exact amounts</option>
                    <option value="percent">Exact percentages</option>
                  </select>
                )}
                {bulkUpdateField === "date" && (
                  <input
                    type="date"
                    className="input input-sm flex-1"
                    value={bulkUpdateValue}
                    onChange={(event) => setBulkUpdateValue(event.target.value)}
                  />
                )}
                {bulkUpdateField === "tags" && (
                  <input
                    type="text"
                    className="input input-sm flex-1"
                    list={tagListId}
                    placeholder="New tags"
                    value={bulkUpdateValue}
                    onChange={(event) => setBulkUpdateValue(event.target.value)}
                  />
                )}
                {bulkUpdateField === "description" && (
                  <input
                    type="text"
                    className="input input-sm flex-1"
                    placeholder="New description"
                    value={bulkUpdateValue}
                    onChange={(event) => setBulkUpdateValue(event.target.value)}
                  />
                )}
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={!bulkUpdateField || !bulkUpdateValue}
                  onClick={() => {
                    if (!bulkUpdateField || !bulkUpdateValue) return;
                    selectedRowIds.forEach((transactionId) => {
                      if (bulkUpdateField === "category") {
                        updateTransaction(transactionId, (item) => ({
                          ...item,
                          category: bulkUpdateValue,
                        }));
                      } else if (bulkUpdateField === "paidById") {
                        updateTransaction(transactionId, (item) => ({
                          ...item,
                          paidById: bulkUpdateValue,
                        }));
                      } else if (bulkUpdateField === "currency") {
                        updateTransaction(transactionId, (item) => ({
                          ...item,
                          currency: normalizeCurrency(bulkUpdateValue),
                        }));
                      } else if (bulkUpdateField === "splitType") {
                        updateTransaction(transactionId, (item) => ({
                          ...item,
                          splitType: bulkUpdateValue as SplitType,
                        }));
                      } else if (bulkUpdateField === "date") {
                        updateTransaction(transactionId, (item) => ({
                          ...item,
                          transactionDate: bulkUpdateValue,
                        }));
                      } else if (bulkUpdateField === "tags") {
                        updateTransaction(transactionId, (item) => ({
                          ...item,
                          tags: bulkUpdateValue,
                        }));
                      } else if (bulkUpdateField === "description") {
                        updateTransaction(transactionId, (item) => ({
                          ...item,
                          description: bulkUpdateValue,
                        }));
                      }
                    });
                    setSelectedRowIds(new Set());
                    setBulkUpdateField(null);
                    setBulkUpdateValue("");
                  }}
                >
                  Apply
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setSelectedRowIds(new Set())}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-error"
                  onClick={() => setBulkDeleteConfirmation(selectedRowIds.size)}
                >
                  Delete selected
                </button>
              </div>
            </div>
          )}
          {loadingData ? (
            <div className="flex justify-center py-4">
              <span
                className="loading loading-spinner loading-md"
                aria-hidden="true"
              />
              <span className="sr-only" role="status">
                Loading transactions…
              </span>
            </div>
          ) : transactions.length > 0 ? (
            <>
              <div className="flex items-center gap-3 mb-3">
                <label className="text-sm font-medium">Sort by:</label>
                <select
                  className="select select-sm"
                  value={sortField}
                  onChange={(e) =>
                    setSortField(e.target.value as typeof sortField)
                  }
                >
                  <option value="name">Name</option>
                  <option value="amount">Amount</option>
                  <option value="currency">Currency</option>
                  <option value="paidById">Paid by</option>
                  <option value="transactionDate">Date</option>
                  <option value="category">Category</option>
                  <option value="description">Description</option>
                </select>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() =>
                    setSortDirection(sortDirection === "asc" ? "desc" : "asc")
                  }
                  title={`Sort ${sortDirection === "asc" ? "ascending" : "descending"}`}
                >
                  {sortDirection === "asc" ? "↑" : "↓"}
                </button>
              </div>
              <div className="overflow-x-auto rounded-md border border-base-300">
                <table className="table table-zebra [&_td]:px-2 [&_td]:py-2 [&_th]:px-2 [&_th]:py-2 w-full [&_td]:align-middle">
                  <thead>
                    <tr>
                      <th className="w-10">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm"
                          aria-label="Select all transactions"
                          checked={
                            selectedRowIds.size > 0 &&
                            selectedRowIds.size === transactions.length
                          }
                          onChange={(event) => {
                            if (event.target.checked) {
                              setSelectedRowIds(
                                new Set(transactions.map((t) => t.id)),
                              );
                            } else {
                              setSelectedRowIds(new Set());
                            }
                          }}
                        />
                      </th>
                      {getVisibleColumns(group).includes("name") && (
                        <th>Name</th>
                      )}
                      {getVisibleColumns(group).includes("amount") && (
                        <th>Amount</th>
                      )}
                      {getVisibleColumns(group).includes("currency") && (
                        <th>Currency</th>
                      )}
                      {getVisibleColumns(group).includes("split") && (
                        <th>Split</th>
                      )}
                      {getVisibleColumns(group).includes("paid_by") && (
                        <th>Paid by</th>
                      )}
                      {getVisibleColumns(group).includes("date") && (
                        <th>Date</th>
                      )}
                      {getVisibleColumns(group).includes("category") && (
                        <th>Category</th>
                      )}
                      {getVisibleColumns(group).includes("description") && (
                        <th>Description</th>
                      )}
                      {getVisibleColumns(group).includes("tags") && (
                        <th>Tags</th>
                      )}
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTransactions.map((transaction) => (
                      <tr key={transaction.id}>
                        <td className="w-10">
                          <input
                            type="checkbox"
                            className="checkbox checkbox-sm"
                            aria-label={`Select ${transaction.name || "transaction"}`}
                            checked={selectedRowIds.has(transaction.id)}
                            onChange={(event) => {
                              const next = new Set(selectedRowIds);
                              if (event.target.checked) {
                                next.add(transaction.id);
                              } else {
                                next.delete(transaction.id);
                              }
                              setSelectedRowIds(next);
                            }}
                          />
                        </td>
                        {getVisibleColumns(group).includes("name") && (
                          <td>
                            <input
                              className="input input-sm w-full min-w-28"
                              value={transaction.name}
                              aria-label="Transaction name"
                              onChange={(event) =>
                                updateTransactionLocal(
                                  transaction.id,
                                  (item) => ({
                                    ...item,
                                    name: event.target.value,
                                  }),
                                )
                              }
                              onBlur={(event) =>
                                updateTransaction(transaction.id, (item) => ({
                                  ...item,
                                  name: event.target.value,
                                }))
                              }
                              placeholder="Dinner"
                            />
                          </td>
                        )}
                        {getVisibleColumns(group).includes("amount") && (
                          <td>
                            <input
                              className="input input-sm w-full min-w-20"
                              type="number"
                              step="0.01"
                              min="0"
                              aria-label="Amount"
                              value={
                                transaction.amount === 0
                                  ? ""
                                  : transaction.amount
                              }
                              placeholder="0.00"
                              onChange={(event) =>
                                updateTransactionLocal(
                                  transaction.id,
                                  (item) => ({
                                    ...item,
                                    amount: Number(event.target.value || 0),
                                  }),
                                )
                              }
                              onBlur={(event) =>
                                updateTransaction(transaction.id, (item) => ({
                                  ...item,
                                  amount: Number(event.target.value || 0),
                                }))
                              }
                            />
                          </td>
                        )}
                        {getVisibleColumns(group).includes("currency") && (
                          <td>
                            <select
                              className="select select-sm w-full min-w-16"
                              aria-label="Currency"
                              value={transaction.currency}
                              onChange={(event) =>
                                updateTransaction(transaction.id, (item) => ({
                                  ...item,
                                  currency: normalizeCurrency(
                                    event.target.value,
                                  ),
                                }))
                              }
                            >
                              {SUPPORTED_CURRENCIES.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </td>
                        )}
                        {getVisibleColumns(group).includes("split") && (
                          <td>
                            <button
                              type="button"
                              ref={(element) => {
                                splitButtonRefs.current[transaction.id] =
                                  element;
                              }}
                              className="btn btn-sm max-w-64 justify-start"
                              aria-label={`Split: ${splitLabel(transaction, group.members)}`}
                              onMouseEnter={() =>
                                openSplitPopover(transaction.id)
                              }
                              onMouseLeave={scheduleSplitPopoverClose}
                              onFocus={() => openSplitPopover(transaction.id)}
                              onBlur={scheduleSplitPopoverClose}
                              onClick={() =>
                                openAdvancedSplitEditor(transaction)
                              }
                            >
                              <span className="truncate">
                                {compactSplitLabel(transaction, group.members)}
                              </span>
                            </button>
                          </td>
                        )}
                        {getVisibleColumns(group).includes("paid_by") && (
                          <td>
                            <PaidBySelect
                              members={group.members}
                              value={transaction.paidById}
                              onChange={(id) =>
                                updateTransaction(transaction.id, (item) => ({
                                  ...item,
                                  paidById: id,
                                }))
                              }
                            />
                          </td>
                        )}
                        {getVisibleColumns(group).includes("date") && (
                          <td>
                            <input
                              className="input input-sm w-full min-w-28"
                              type="date"
                              aria-label="Transaction date"
                              value={transaction.transactionDate}
                              onChange={(event) =>
                                updateTransactionLocal(
                                  transaction.id,
                                  (item) => ({
                                    ...item,
                                    transactionDate: event.target.value,
                                  }),
                                )
                              }
                              onBlur={(event) =>
                                updateTransaction(transaction.id, (item) => ({
                                  ...item,
                                  transactionDate: event.target.value,
                                }))
                              }
                            />
                          </td>
                        )}
                        {getVisibleColumns(group).includes("category") && (
                          <td>
                            <select
                              className="select select-sm w-full min-w-20"
                              aria-label="Category"
                              value={transaction.category}
                              onChange={(event) => {
                                if (event.target.value === "add-new") {
                                  setNewCategoryDialog({
                                    open: true,
                                    inputValue: "",
                                    transactionId: transaction.id,
                                  });
                                  event.target.value = transaction.category;
                                } else {
                                  updateTransaction(transaction.id, (item) => ({
                                    ...item,
                                    category: event.target.value,
                                  }));
                                }
                              }}
                            >
                              <option value="">Select category</option>
                              {categories.map((cat) => (
                                <option key={cat} value={cat}>
                                  {emojiMap.category[cat] &&
                                    `${emojiMap.category[cat]} `}
                                  {cat}
                                </option>
                              ))}
                              <option disabled>—</option>
                              <option value="add-new">
                                + Add new category
                              </option>
                            </select>
                          </td>
                        )}
                        {getVisibleColumns(group).includes("description") && (
                          <td>
                            <input
                              className="input input-sm w-full min-w-28"
                              aria-label="Description"
                              value={transaction.description}
                              onChange={(event) =>
                                updateTransactionLocal(
                                  transaction.id,
                                  (item) => ({
                                    ...item,
                                    description: event.target.value,
                                  }),
                                )
                              }
                              onBlur={(event) =>
                                updateTransaction(transaction.id, (item) => ({
                                  ...item,
                                  description: event.target.value,
                                }))
                              }
                              placeholder="Optional"
                            />
                          </td>
                        )}
                        {getVisibleColumns(group).includes("tags") && (
                          <td>
                            <div className="flex flex-wrap gap-1 items-center">
                              {transaction.tags
                                .split(",")
                                .map((tag) => tag.trim())
                                .filter(Boolean)
                                .map((tag) => (
                                  <div
                                    key={tag}
                                    className="badge badge-sm badge-outline gap-1.5"
                                  >
                                    {emojiMap.tag[tag] && (
                                      <span>{emojiMap.tag[tag]}</span>
                                    )}
                                    {tag}
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn-xs p-0 h-4 w-4 min-h-fit"
                                      onClick={() =>
                                        updateTransaction(
                                          transaction.id,
                                          (item) => ({
                                            ...item,
                                            tags: item.tags
                                              .split(",")
                                              .map((t) => t.trim())
                                              .filter((t) => t && t !== tag)
                                              .join(", "),
                                          }),
                                        )
                                      }
                                      aria-label={`Remove tag: ${tag}`}
                                    >
                                      ×
                                    </button>
                                  </div>
                                ))}
                              <select
                                className="select select-sm !select-xs min-w-24 max-w-32 h-6"
                                defaultValue=""
                                onChange={(event) => {
                                  const value = event.target.value.trim();
                                  if (value === "add-new") {
                                    setNewTagDialog({
                                      open: true,
                                      inputValue: "",
                                      transactionId: transaction.id,
                                    });
                                    event.target.value = "";
                                  } else if (value) {
                                    const currentTags = transaction.tags
                                      .split(",")
                                      .map((t) => t.trim())
                                      .filter(Boolean);
                                    if (!currentTags.includes(value)) {
                                      const newTags = [
                                        ...currentTags,
                                        value,
                                      ].sort();
                                      updateTransaction(
                                        transaction.id,
                                        (item) => ({
                                          ...item,
                                          tags: newTags.join(", "),
                                        }),
                                      );
                                      addTags(value, setTags);
                                    }
                                    event.target.value = "";
                                  }
                                }}
                              >
                                <option value="">+</option>
                                {tags
                                  .filter(
                                    (tag) => !transaction.tags.includes(tag),
                                  )
                                  .map((tag) => (
                                    <option key={tag} value={tag}>
                                      {emojiMap.tag[tag] &&
                                        `${emojiMap.tag[tag]} `}
                                      {tag}
                                    </option>
                                  ))}
                                <option disabled>—</option>
                                <option value="add-new">+ Add new tag</option>
                              </select>
                            </div>
                          </td>
                        )}
                        <td className="text-xs text-base-content/60 whitespace-nowrap">
                          <span aria-live="polite" aria-atomic="true">
                            {savingTransactions[transaction.id]
                              ? "Saving…"
                              : "Saved"}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm text-error"
                            onClick={() =>
                              setDeleteConfirmation({
                                transactionId: transaction.id,
                                transactionName:
                                  transaction.name || "this transaction",
                              })
                            }
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="alert alert-soft">
              <span>
                No transactions yet. Create one to start tracking this group.
              </span>
            </div>
          )}
        </div>
      </section>

      <datalist id={categoryListId}>
        {categories.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>

      <datalist id={tagListId}>
        {tags.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>

      {activeSplitTransaction && splitEditor && (
        <AdvancedSplitModal
          members={group.members}
          splitType={splitEditor.splitType}
          splitData={splitEditor.splitData}
          onSplitTypeChange={(value) =>
            setSplitEditor((prev) =>
              prev ? { ...prev, splitType: value } : prev,
            )
          }
          onMemberToggle={(memberId) =>
            setSplitEditor((prev) => {
              if (!prev) {
                return prev;
              }

              const includedMemberIds =
                prev.splitData.includedMemberIds.includes(memberId)
                  ? prev.splitData.includedMemberIds.filter(
                      (id) => id !== memberId,
                    )
                  : [...prev.splitData.includedMemberIds, memberId];

              return {
                ...prev,
                splitData: {
                  ...prev.splitData,
                  includedMemberIds,
                  values: {
                    ...prev.splitData.values,
                    [memberId]: prev.splitData.values[memberId] ?? 0,
                  },
                },
              };
            })
          }
          onValueChange={(memberId, value) =>
            setSplitEditor((prev) => {
              if (!prev) {
                return prev;
              }

              return {
                ...prev,
                splitData: {
                  ...prev.splitData,
                  values: {
                    ...prev.splitData.values,
                    [memberId]: Number(value || 0),
                  },
                },
              };
            })
          }
          onCancel={() => {
            setActiveSplitTransactionId(null);
            setSplitEditor(null);
          }}
          onSave={saveAdvancedSplit}
        />
      )}

      {splitPopover &&
        (() => {
          const transaction = transactions.find(
            (item) => item.id === splitPopover.transactionId,
          );

          if (!transaction) {
            return null;
          }

          return (
            <SplitQuickSelectPopover
              transaction={transaction}
              members={group.members}
              position={splitPopover.position}
              placement={splitPopover.placement}
              onMemberToggle={(memberId) =>
                toggleTransactionSplitMember(transaction.id, memberId)
              }
              onOpenAdvanced={() => openAdvancedSplitEditor(transaction)}
              onMouseEnter={clearSplitPopoverCloseTimer}
              onMouseLeave={scheduleSplitPopoverClose}
            />
          );
        })()}

      {importState && (
        <CsvImportModal
          fileName={importState.fileName}
          parsed={importState.parsed}
          mapping={importState.mapping}
          previewRows={sanitizedRows}
          validCount={sanitizedRows.length}
          invalidCount={Math.max(0, mappedRows.length - sanitizedRows.length)}
          isImporting={importingCsv}
          groupMembers={group.members}
          paidByIdMapping={paidByIdMapping}
          onPaidByIdMappingChange={(csvValue, memberId) =>
            setPaidByIdMapping((prev) => ({
              ...prev,
              [csvValue]: memberId,
            }))
          }
          onChangeMapping={(field, column) =>
            setImportState((prev) => {
              if (!prev) {
                return prev;
              }

              return {
                ...prev,
                mapping: {
                  ...prev.mapping,
                  [field]: column,
                },
              };
            })
          }
          onCancel={() => {
            setImportState(null);
            setPaidByIdMapping({});
            setImportError(null);
          }}
          onImport={handleImport}
          emojiMap={emojiMap}
        />
      )}

      {newCategoryDialog.open && (
        <dialog
          className="modal modal-open"
          aria-modal="true"
          aria-labelledby="new-category-title"
        >
          <div className="modal-box max-w-md">
            <h3 id="new-category-title" className="font-semibold text-lg">
              Add new category
            </h3>
            <input
              autoFocus
              type="text"
              placeholder="Enter category name"
              className="input input-bordered w-full mt-3"
              value={newCategoryDialog.inputValue}
              onChange={(e) =>
                setNewCategoryDialog((prev) => ({
                  ...prev,
                  inputValue: e.target.value,
                }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const value = newCategoryDialog.inputValue.trim();
                  if (value && !categories.includes(value)) {
                    addCategory(value, setCategories);
                    if (newCategoryDialog.transactionId) {
                      updateTransaction(
                        newCategoryDialog.transactionId,
                        (item) => ({
                          ...item,
                          category: value,
                        }),
                      );
                    }
                    setNewCategoryDialog({
                      open: false,
                      inputValue: "",
                      transactionId: null,
                    });
                  }
                } else if (e.key === "Escape") {
                  setNewCategoryDialog({
                    open: false,
                    inputValue: "",
                    transactionId: null,
                  });
                }
              }}
            />
            <div className="modal-action">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  setNewCategoryDialog({
                    open: false,
                    inputValue: "",
                    transactionId: null,
                  })
                }
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => {
                  const value = newCategoryDialog.inputValue.trim();
                  if (value && !categories.includes(value)) {
                    addCategory(value, setCategories);
                    if (newCategoryDialog.transactionId) {
                      updateTransaction(
                        newCategoryDialog.transactionId,
                        (item) => ({
                          ...item,
                          category: value,
                        }),
                      );
                    }
                    setNewCategoryDialog({
                      open: false,
                      inputValue: "",
                      transactionId: null,
                    });
                  }
                }}
              >
                Add
              </button>
            </div>
          </div>
        </dialog>
      )}

      {newTagDialog.open && (
        <dialog
          className="modal modal-open"
          aria-modal="true"
          aria-labelledby="new-tag-title"
        >
          <div className="modal-box max-w-md">
            <h3 id="new-tag-title" className="font-semibold text-lg">
              Add new tag
            </h3>
            <input
              autoFocus
              type="text"
              placeholder="Enter tag name"
              className="input input-bordered w-full mt-3"
              value={newTagDialog.inputValue}
              onChange={(e) =>
                setNewTagDialog((prev) => ({
                  ...prev,
                  inputValue: e.target.value,
                }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const value = newTagDialog.inputValue.trim();
                  if (value && !tags.includes(value)) {
                    addTags(value, setTags);
                    if (newTagDialog.transactionId) {
                      const currentTags =
                        transactions
                          .find((t) => t.id === newTagDialog.transactionId)
                          ?.tags.split(",")
                          .map((t) => t.trim())
                          .filter(Boolean) || [];
                      const newTags = [...currentTags, value].sort();
                      updateTransaction(newTagDialog.transactionId, (item) => ({
                        ...item,
                        tags: newTags.join(", "),
                      }));
                    }
                    setNewTagDialog({
                      open: false,
                      inputValue: "",
                      transactionId: null,
                    });
                  }
                } else if (e.key === "Escape") {
                  setNewTagDialog({
                    open: false,
                    inputValue: "",
                    transactionId: null,
                  });
                }
              }}
            />
            <div className="modal-action">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  setNewTagDialog({
                    open: false,
                    inputValue: "",
                    transactionId: null,
                  })
                }
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => {
                  const value = newTagDialog.inputValue.trim();
                  if (value && !tags.includes(value)) {
                    addTags(value, setTags);
                    if (newTagDialog.transactionId) {
                      const currentTags =
                        transactions
                          .find((t) => t.id === newTagDialog.transactionId)
                          ?.tags.split(",")
                          .map((t) => t.trim())
                          .filter(Boolean) || [];
                      const newTags = [...currentTags, value].sort();
                      updateTransaction(newTagDialog.transactionId, (item) => ({
                        ...item,
                        tags: newTags.join(", "),
                      }));
                    }
                    setNewTagDialog({
                      open: false,
                      inputValue: "",
                      transactionId: null,
                    });
                  }
                }}
              >
                Add
              </button>
            </div>
          </div>
        </dialog>
      )}

      {deleteConfirmation && (
        <dialog
          className="modal modal-open"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div className="modal-box max-w-md">
            <h3 id="delete-modal-title" className="font-semibold text-lg">
              Delete transaction
            </h3>
            <p className="py-3 text-sm text-base-content/70">
              This will permanently delete &ldquo;
              {deleteConfirmation.transactionName}&rdquo;.
            </p>
            <div className="modal-action">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setDeleteConfirmation(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-sm btn-error"
                disabled={savingTransactions[deleteConfirmation.transactionId]}
                onClick={() =>
                  deleteTransaction(deleteConfirmation.transactionId)
                }
              >
                {savingTransactions[deleteConfirmation.transactionId]
                  ? "Deleting…"
                  : "Delete"}
              </button>
            </div>
          </div>
        </dialog>
      )}

      {bulkDeleteConfirmation && (
        <dialog
          className="modal modal-open"
          aria-modal="true"
          aria-labelledby="bulk-delete-modal-title"
        >
          <div className="modal-box max-w-md">
            <h3 id="bulk-delete-modal-title" className="font-semibold text-lg">
              Delete {bulkDeleteConfirmation} transaction
              {bulkDeleteConfirmation !== 1 ? "s" : ""}
            </h3>
            <p className="py-3 text-sm text-base-content/70">
              This will permanently delete {bulkDeleteConfirmation} selected
              transaction{bulkDeleteConfirmation !== 1 ? "s" : ""}. This action
              cannot be undone.
            </p>
            <div className="modal-action">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setBulkDeleteConfirmation(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-sm btn-error"
                disabled={selectedRowIds.size === 0}
                onClick={deleteBulkTransactions}
              >
                Delete {bulkDeleteConfirmation}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
