import { useEffect, useMemo, useRef, useState } from "react";
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
  createDefaultSplitData,
  getDateInputValue,
  memberName,
  normalizeCurrency,
  normalizeTransaction,
  SUPPORTED_CURRENCIES,
  splitLabel,
} from "../utils/spending";
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

function summarizeTransaction(transaction: Transaction) {
  return {
    id: transaction.id,
    batchId: transaction.batchId,
    amount: transaction.amount,
    name: transaction.name,
    description: transaction.description,
    transactionDate: transaction.transactionDate,
    category: transaction.category,
    paidById: transaction.paidById,
    splitType: transaction.splitType,
    splitMembers: transaction.splitData.includedMemberIds,
    splitValueCount: Object.keys(transaction.splitData.values).length,
  };
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
    <dialog className="modal modal-open">
      <div className="modal-box max-w-2xl">
        <h3 className="font-semibold text-lg">Advanced split</h3>
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
    paidById: string;
  }>;
  validCount: number;
  invalidCount: number;
  isImporting: boolean;
  onChangeMapping: (field: CsvImportField, column: string) => void;
  onCancel: () => void;
  onImport: () => void;
}) {
  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-5xl">
        <h3 className="font-semibold text-lg">Import transactions from CSV</h3>
        <p className="text-sm text-base-content/70 mt-1">
          {fileName} • {parsed.rows.length} row(s) detected
        </p>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="card card-border bg-base-100">
            <div className="card-body p-4 gap-3">
              <h4 className="font-semibold">Field mapping</h4>
              <p className="text-xs text-base-content/70">
                Adjust how CSV columns map to app fields. This mapping will be
                saved as your default for next imports.
              </p>
              <div className="flex flex-col gap-2">
                {csvImportFields.map((field) => (
                  <label key={field} className="fieldset">
                    <legend className="fieldset-legend">
                      {importFieldLabel(field)}
                    </legend>
                    <select
                      className="select select-sm w-full"
                      value={mapping[field]}
                      onChange={(event) =>
                        onChangeMapping(field, event.target.value)
                      }
                    >
                      <option value="">Not mapped</option>
                      {parsed.headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="card card-border bg-base-100">
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
                      <th>Name</th>
                      <th>Date</th>
                      <th>Category</th>
                      <th>Paid by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.slice(0, 6).map((row, index) => (
                      <tr key={`${row.name}-${index}`}>
                        <td>{row.amount.toFixed(2)}</td>
                        <td>{row.name}</td>
                        <td>{row.transactionDate}</td>
                        <td>{row.category || "-"}</td>
                        <td>{row.paidById || "-"}</td>
                      </tr>
                    ))}
                    {previewRows.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center text-sm">
                          No valid rows to import with current mapping.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
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
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [savingTransactions, setSavingTransactions] = useState<
    Record<string, boolean>
  >({});
  const [activeSplitTransactionId, setActiveSplitTransactionId] = useState<
    string | null
  >(null);
  const [splitEditor, setSplitEditor] = useState<{
    splitType: SplitType;
    splitData: SplitData;
  } | null>(null);
  const [savedImportMapping, setSavedImportMapping] =
    useState<Partial<CsvColumnMapping> | null>(null);
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
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [bulkUpdateField, setBulkUpdateField] = useState<
    | "category"
    | "paidById"
    | "currency"
    | "splitType"
    | "date"
    | "description"
    | null
  >(null);
  const [bulkUpdateValue, setBulkUpdateValue] = useState<string>("");

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
  }, [externalTransaction, group.id]);

  const activeSplitTransaction =
    transactions.find(
      (transaction) => transaction.id === activeSplitTransactionId,
    ) || null;
  const categoryListId = `category-options-${group.id}`;
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
    };
  }, []);

  useEffect(() => {
    setActiveSplitTransactionId(null);
    setSplitEditor(null);
    setImportState(null);
    setImportError(null);
  }, [group.id]);

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
        setTransactions(
          ((data.spendings || []) as any[]).map((transaction) =>
            normalizeTransaction(transaction, group),
          ),
        );
        setCategories((data.categories || []) as string[]);
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

  const updateTransaction = (
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

    scheduleTransactionSave(nextTransaction);
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

      const importedResult = await apiCall("/api/spendings/import", {
        method: "POST",
        body: JSON.stringify({
          batchId: group.id,
          rows: sanitizedRows,
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
      setImportState(null);
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
              </div>
            </div>
          )}
          {loadingData ? (
            <div className="flex justify-center py-4">
              <span className="loading loading-spinner loading-md" />
            </div>
          ) : transactions.length > 0 ? (
            <div className="overflow-x-auto rounded-md border border-base-300">
              <table className="table table-zebra [&_td]:px-2 [&_td]:py-2 [&_th]:px-2 [&_th]:py-2 w-full [&_td]:align-middle">
                <thead>
                  <tr>
                    <th className="w-10">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
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
                    {getVisibleColumns(group).includes("name") && <th>Name</th>}
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
                    {getVisibleColumns(group).includes("date") && <th>Date</th>}
                    {getVisibleColumns(group).includes("category") && (
                      <th>Category</th>
                    )}
                    {getVisibleColumns(group).includes("description") && (
                      <th>Description</th>
                    )}
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td className="w-10">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm"
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
                            value={
                              transaction.amount === 0 ? "" : transaction.amount
                            }
                            placeholder="0.00"
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
                            value={transaction.currency}
                            onChange={(event) =>
                              updateTransaction(transaction.id, (item) => ({
                                ...item,
                                currency: normalizeCurrency(event.target.value),
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
                            className="btn btn-sm"
                            onClick={() => {
                              setActiveSplitTransactionId(transaction.id);
                              setSplitEditor({
                                splitType: transaction.splitType,
                                splitData: {
                                  includedMemberIds: [
                                    ...transaction.splitData.includedMemberIds,
                                  ],
                                  values: { ...transaction.splitData.values },
                                },
                              });
                            }}
                          >
                            {splitLabel(transaction, group.members)}
                          </button>
                        </td>
                      )}
                      {getVisibleColumns(group).includes("paid_by") && (
                        <td>
                          <select
                            className="select select-sm w-full min-w-24"
                            value={transaction.paidById}
                            onChange={(event) =>
                              updateTransaction(transaction.id, (item) => ({
                                ...item,
                                paidById: event.target.value,
                              }))
                            }
                          >
                            {group.members.map((member) => (
                              <option key={member.id} value={member.id}>
                                {memberName(member)}
                              </option>
                            ))}
                          </select>
                        </td>
                      )}
                      {getVisibleColumns(group).includes("date") && (
                        <td>
                          <input
                            className="input input-sm w-full min-w-28"
                            type="date"
                            value={transaction.transactionDate}
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
                          <input
                            className="input input-sm w-full min-w-20"
                            list={categoryListId}
                            value={transaction.category}
                            onBlur={(event) =>
                              updateTransaction(transaction.id, (item) => ({
                                ...item,
                                category: event.target.value,
                              }))
                            }
                            placeholder="Food"
                          />
                        </td>
                      )}
                      {getVisibleColumns(group).includes("description") && (
                        <td>
                          <input
                            className="input input-sm w-full min-w-28"
                            value={transaction.description}
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
                      <td className="text-xs text-base-content/60 whitespace-nowrap">
                        {savingTransactions[transaction.id]
                          ? "Saving…"
                          : "Saved"}
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

      {importState && (
        <CsvImportModal
          fileName={importState.fileName}
          parsed={importState.parsed}
          mapping={importState.mapping}
          previewRows={sanitizedRows}
          validCount={sanitizedRows.length}
          invalidCount={Math.max(0, mappedRows.length - sanitizedRows.length)}
          isImporting={importingCsv}
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
            setImportError(null);
          }}
          onImport={handleImport}
        />
      )}

      {deleteConfirmation && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-md">
            <h3 className="font-semibold text-lg">Delete transaction</h3>
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
    </>
  );
}
