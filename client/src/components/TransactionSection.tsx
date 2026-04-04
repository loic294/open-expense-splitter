import { useEffect, useRef, useState } from "react";
import { useApiCall } from "../api";
import type {
  Group,
  GroupMember,
  SplitData,
  SplitType,
  Transaction,
} from "../types";
import {
  createDefaultSplitData,
  getDateInputValue,
  memberName,
  normalizeTransaction,
  splitLabel,
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

export default function TransactionSection({ group }: { group: Group }) {
  const apiCall = useApiCall();
  const saveTimersRef = useRef<Record<string, number>>({});
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

  const activeSplitTransaction =
    transactions.find(
      (transaction) => transaction.id === activeSplitTransactionId,
    ) || null;
  const categoryListId = `category-options-${group.id}`;

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
  }, [group.id]);

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

  return (
    <>
      <section className="card card-border bg-base-100 rounded-md w-full">
        <div className="card-body p-3 md:p-4 gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">{group.emoji}</span>
                <h2 className="card-title text-base">{group.name}</h2>
              </div>
              <p className="text-sm text-base-content/70">
                {group.members.length} member(s)
              </p>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={createTransaction}
            >
              New transaction
            </button>
          </div>
        </div>
      </section>

      <section className="card card-border bg-base-100 rounded-md w-full">
        <div className="card-body p-3 md:p-4 gap-3">
          <h2 className="card-title text-base">Transactions</h2>
          {loadingData ? (
            <div className="flex justify-center py-4">
              <span className="loading loading-spinner loading-md" />
            </div>
          ) : transactions.length > 0 ? (
            <div className="flex flex-col gap-3">
              {transactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="rounded-md border border-base-300 bg-base-100 p-3"
                >
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <fieldset className="fieldset">
                      <legend className="fieldset-legend">Amount</legend>
                      <input
                        className="input input-sm w-full"
                        type="number"
                        step="0.01"
                        min="0"
                        value={transaction.amount}
                        onChange={(event) =>
                          updateTransaction(transaction.id, (item) => ({
                            ...item,
                            amount: Number(event.target.value || 0),
                          }))
                        }
                      />
                    </fieldset>

                    <fieldset className="fieldset">
                      <legend className="fieldset-legend">Name</legend>
                      <input
                        className="input input-sm w-full"
                        value={transaction.name}
                        onChange={(event) =>
                          updateTransaction(transaction.id, (item) => ({
                            ...item,
                            name: event.target.value,
                          }))
                        }
                        placeholder="Dinner"
                      />
                    </fieldset>

                    <fieldset className="fieldset">
                      <legend className="fieldset-legend">Description</legend>
                      <input
                        className="input input-sm w-full"
                        value={transaction.description}
                        onChange={(event) =>
                          updateTransaction(transaction.id, (item) => ({
                            ...item,
                            description: event.target.value,
                          }))
                        }
                        placeholder="Optional"
                      />
                    </fieldset>

                    <fieldset className="fieldset">
                      <legend className="fieldset-legend">
                        Transaction date
                      </legend>
                      <input
                        className="input input-sm w-full"
                        type="date"
                        value={transaction.transactionDate}
                        onChange={(event) =>
                          updateTransaction(transaction.id, (item) => ({
                            ...item,
                            transactionDate: event.target.value,
                          }))
                        }
                      />
                    </fieldset>

                    <fieldset className="fieldset">
                      <legend className="fieldset-legend">Category</legend>
                      <input
                        className="input input-sm w-full"
                        list={categoryListId}
                        value={transaction.category}
                        onChange={(event) =>
                          updateTransaction(transaction.id, (item) => ({
                            ...item,
                            category: event.target.value,
                          }))
                        }
                        placeholder="Food"
                      />
                    </fieldset>

                    <fieldset className="fieldset">
                      <legend className="fieldset-legend">Split</legend>
                      <button
                        type="button"
                        className="btn btn-sm justify-start"
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
                    </fieldset>

                    <fieldset className="fieldset">
                      <legend className="fieldset-legend">Paid by</legend>
                      <select
                        className="select select-sm w-full"
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
                    </fieldset>

                    <fieldset className="fieldset">
                      <legend className="fieldset-legend">Advanced</legend>
                      <div className="flex items-center gap-2">
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
                          Advanced
                        </button>
                        {savingTransactions[transaction.id] && (
                          <span className="loading loading-spinner loading-xs" />
                        )}
                      </div>
                    </fieldset>
                  </div>
                </div>
              ))}
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
    </>
  );
}
