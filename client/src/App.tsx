import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApiCall } from "./api";
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
} from "./utils/csvImport";

type PageView = "dashboard" | "profile";
type SplitType = "equal" | "amount" | "percent";

interface ProfileForm {
  name: string;
  email: string;
  picture: string;
}

interface GroupMember {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
}

interface Group {
  id: string;
  name: string;
  emoji: string;
  description: string | null;
  owner_id: string;
  members: GroupMember[];
  canEdit: boolean;
}

interface GroupForm {
  id?: string;
  name: string;
  emoji: string;
  memberIds: string[];
}

interface SplitData {
  includedMemberIds: string[];
  values: Record<string, number>;
}

interface Transaction {
  id: string;
  batchId: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  transactionDate: string;
  category: string;
  paidById: string;
  splitType: SplitType;
  splitData: SplitData;
}

interface MemberBalance {
  memberId: string;
  paid: number;
  owed: number;
  net: number;
}

interface SettlementStep {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
}

interface GroupExpenseSummary {
  totalExpenses: number;
  balances: MemberBalance[];
  settlements: SettlementStep[];
}

const SUPPORTED_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "CHF",
  "JPY",
  "CNY",
  "INR",
  "BRL",
  "MXN",
] as const;

function normalizeCurrency(raw?: string) {
  const value = (raw || "").trim().toUpperCase();
  return SUPPORTED_CURRENCIES.includes(
    value as (typeof SUPPORTED_CURRENCIES)[number],
  )
    ? value
    : "USD";
}

function normalizeSupportedCurrencies(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const normalized = raw
    .filter((item): item is string => typeof item === "string")
    .map((item: string) => normalizeCurrency(item));

  return Array.from(new Set(normalized));
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function currencyLabel(value: number, currency: string) {
  const normalizedCurrency = normalizeCurrency(currency);
  const formatted = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: normalizedCurrency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

  return normalizedCurrency === "USD" ? `USD ${formatted}` : formatted;
}

function splitWeights(
  transaction: Transaction,
  includedMemberIds: string[],
): Record<string, number> {
  const weights: Record<string, number> = {};

  if (transaction.splitType === "equal") {
    includedMemberIds.forEach((memberId) => {
      weights[memberId] = 1;
    });
    return weights;
  }

  includedMemberIds.forEach((memberId) => {
    const raw = transaction.splitData.values[memberId] ?? 0;
    weights[memberId] = raw > 0 ? raw : 0;
  });

  const totalWeight = Object.values(weights).reduce(
    (sum, value) => sum + value,
    0,
  );
  if (totalWeight <= 0) {
    includedMemberIds.forEach((memberId) => {
      weights[memberId] = 1;
    });
  }

  return weights;
}

function getReimbursementRecipientId(
  transaction: Transaction,
  memberSet: Set<string>,
): string | null {
  if (transaction.amount >= 0) {
    return null;
  }

  const includedMemberIds = transaction.splitData.includedMemberIds.filter(
    (memberId) => memberSet.has(memberId),
  );
  if (includedMemberIds.length !== 2) {
    return null;
  }

  if (!includedMemberIds.includes(transaction.paidById)) {
    return null;
  }

  const recipientId =
    includedMemberIds.find((memberId) => memberId !== transaction.paidById) ||
    null;
  if (!recipientId) {
    return null;
  }

  const payerWeight = transaction.splitData.values[transaction.paidById] ?? 0;
  const recipientWeight = transaction.splitData.values[recipientId] ?? 0;

  return payerWeight > 0 && recipientWeight <= 0 ? recipientId : null;
}

function buildGroupExpenseSummary(
  members: GroupMember[],
  transactions: Transaction[],
  toDisplayAmount: (transaction: Transaction) => number,
): GroupExpenseSummary {
  const memberIds = members.map((member) => member.id);
  const memberSet = new Set(memberIds);
  const balances = new Map<string, MemberBalance>(
    memberIds.map((memberId) => [
      memberId,
      { memberId, paid: 0, owed: 0, net: 0 },
    ]),
  );

  let totalExpenses = 0;

  transactions.forEach((transaction) => {
    const amount = Number(toDisplayAmount(transaction) || 0);
    if (amount === 0) {
      return;
    }

    const reimbursementRecipientId = getReimbursementRecipientId(
      transaction,
      memberSet,
    );
    if (reimbursementRecipientId) {
      const transferAmount = Math.abs(amount);
      const payer = balances.get(transaction.paidById);
      if (payer) {
        payer.paid += transferAmount;
      }

      const recipient = balances.get(reimbursementRecipientId);
      if (recipient) {
        recipient.owed += transferAmount;
      }

      return;
    }

    if (amount < 0) {
      return;
    }

    totalExpenses += amount;

    const payer = balances.get(transaction.paidById);
    if (payer) {
      payer.paid += amount;
    }

    const included = transaction.splitData.includedMemberIds.filter(
      (memberId) => memberSet.has(memberId),
    );
    const includedMemberIds = included.length > 0 ? included : memberIds;
    if (includedMemberIds.length === 0) {
      return;
    }

    const weights = splitWeights(transaction, includedMemberIds);
    const totalWeight = Object.values(weights).reduce(
      (sum, value) => sum + value,
      0,
    );
    const safeTotalWeight =
      totalWeight > 0 ? totalWeight : includedMemberIds.length;

    includedMemberIds.forEach((memberId) => {
      const weight = weights[memberId] ?? 1;
      const share = amount * (weight / safeTotalWeight);
      const balance = balances.get(memberId);
      if (balance) {
        balance.owed += share;
      }
    });
  });

  const normalizedBalances = Array.from(balances.values()).map((balance) => {
    const paid = roundCurrency(balance.paid);
    const owed = roundCurrency(balance.owed);
    const net = roundCurrency(paid - owed);
    return {
      ...balance,
      paid,
      owed,
      net,
    };
  });

  const creditors = normalizedBalances
    .filter((balance) => balance.net > 0.01)
    .map((balance) => ({ ...balance }))
    .sort((a, b) => b.net - a.net);
  const debtors = normalizedBalances
    .filter((balance) => balance.net < -0.01)
    .map((balance) => ({ ...balance, net: Math.abs(balance.net) }))
    .sort((a, b) => b.net - a.net);

  const settlements: SettlementStep[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = roundCurrency(Math.min(creditor.net, debtor.net));

    if (amount > 0.01) {
      settlements.push({
        fromMemberId: debtor.memberId,
        toMemberId: creditor.memberId,
        amount,
      });
    }

    creditor.net = roundCurrency(creditor.net - amount);
    debtor.net = roundCurrency(debtor.net - amount);

    if (creditor.net <= 0.01) {
      creditorIndex += 1;
    }
    if (debtor.net <= 0.01) {
      debtorIndex += 1;
    }
  }

  return {
    totalExpenses: roundCurrency(totalExpenses),
    balances: normalizedBalances,
    settlements,
  };
}

function getDateInputValue(value?: string) {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }

  return value.includes("T") ? value.slice(0, 10) : value;
}

function routeGroupId(groupId: string) {
  return groupId.replace(/^batch_/, "");
}

function getGroupIdFromPath() {
  const match = window.location.pathname.match(/^\/groups\/([^/]+)$/);
  if (!match) {
    return null;
  }

  const value = decodeURIComponent(match[1] || "").trim();
  return value || null;
}

function setGroupIdInPath(groupId: string | null) {
  const url = new URL(window.location.href);
  url.searchParams.delete("group");

  if (groupId) {
    url.pathname = `/groups/${encodeURIComponent(routeGroupId(groupId))}`;
  } else {
    url.pathname = "/";
  }

  window.history.replaceState(
    {},
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

function exchangeRateCacheKey(
  date: string,
  baseCurrency: string,
  targetCurrency: string,
) {
  return `${date}|${normalizeCurrency(baseCurrency)}|${normalizeCurrency(targetCurrency)}`;
}

function createDefaultSplitData(memberIds: string[]): SplitData {
  return {
    includedMemberIds: memberIds,
    values: Object.fromEntries(memberIds.map((id) => [id, 0])),
  };
}

function createReimbursementSplitData(
  memberIds: string[],
  payerId: string,
  recipientId: string,
): SplitData {
  return {
    includedMemberIds: [payerId, recipientId],
    values: Object.fromEntries(
      memberIds.map((id) => [id, id === payerId ? 100 : 0]),
    ),
  };
}

function normalizeTransaction(raw: any, group: Group | null): Transaction {
  const memberIds = group?.members.map((member) => member.id) || [];
  const splitData = raw.split_data || createDefaultSplitData(memberIds);

  return {
    id: raw.id,
    batchId: raw.batch_id,
    amount: Number(raw.amount || 0),
    currency: normalizeCurrency(raw.currency),
    name: raw.name || raw.description || "",
    description: raw.details || "",
    transactionDate: getDateInputValue(raw.transaction_date || raw.date),
    category: raw.category || "",
    paidById: raw.paid_by_id || memberIds[0] || "",
    splitType: (raw.split_type || "equal") as SplitType,
    splitData: {
      includedMemberIds:
        splitData.includedMemberIds?.length > 0
          ? splitData.includedMemberIds
          : memberIds,
      values: splitData.values || {},
    },
  };
}

function splitLabel(transaction: Transaction, members: GroupMember[]) {
  if (transaction.splitType === "percent") {
    return "Exact %";
  }

  if (transaction.splitType === "amount") {
    return "Exact amounts";
  }

  const includedCount = transaction.splitData.includedMemberIds.length;
  if (includedCount === 2) {
    return "50 / 50";
  }

  if (includedCount > 0) {
    return `Equal (${includedCount})`;
  }

  return `Equal (${members.length})`;
}

function memberName(member: GroupMember) {
  return member.name || member.email;
}

function memberInitial(member: GroupMember) {
  const label = memberName(member).trim();
  if (!label) {
    return "U";
  }

  return label[0].toUpperCase();
}

function MemberIdentity({
  member,
  showEmail = false,
}: {
  member: GroupMember;
  showEmail?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="avatar">
        <span className="w-6 rounded-full bg-base-200 text-[10px] font-medium text-base-content/70 flex items-center justify-center overflow-hidden">
          {member.picture ? (
            <img src={member.picture} alt={memberName(member)} />
          ) : (
            memberInitial(member)
          )}
        </span>
      </span>
      <span>
        {memberName(member)}
        {showEmail && member.email ? ` (${member.email})` : ""}
      </span>
    </span>
  );
}

function getUserIdFromSub(sub?: string) {
  if (!sub) {
    return "";
  }

  return `user_${sub.replace(/:/g, "_")}`;
}

function summarizeTransaction(transaction: Transaction) {
  return {
    id: transaction.id,
    batchId: transaction.batchId,
    amount: transaction.amount,
    currency: transaction.currency,
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

function CsvImportModal({
  fileName,
  parsed,
  mapping,
  previewRows,
  validCount,
  invalidCount,
  selectedCurrency,
  currencies,
  isImporting,
  onChangeMapping,
  onCurrencyChange,
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
  selectedCurrency: string;
  currencies: string[];
  isImporting: boolean;
  onChangeMapping: (field: CsvImportField, column: string) => void;
  onCurrencyChange: (currency: string) => void;
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

        <fieldset className="fieldset mt-3 max-w-xs">
          <legend className="fieldset-legend">Import currency</legend>
          <select
            className="select select-sm w-full"
            value={selectedCurrency}
            onChange={(event) => onCurrencyChange(event.target.value)}
          >
            {currencies.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </fieldset>

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

function App() {
  const { loginWithRedirect, logout, isAuthenticated, isLoading, user } =
    useAuth0();
  const apiCall = useApiCall();
  const saveTimersRef = useRef<Record<string, number>>({});
  const csvInputRef = useRef<HTMLInputElement | null>(null);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [savingTransactions, setSavingTransactions] = useState<
    Record<string, boolean>
  >({});
  const [currentView, setCurrentView] = useState<PageView>("dashboard");
  const [profileForm, setProfileForm] = useState<ProfileForm>({
    name: "",
    email: "",
    picture: "",
  });
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [availableUsers, setAvailableUsers] = useState<GroupMember[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupForm, setGroupForm] = useState<GroupForm>({
    name: "",
    emoji: "💸",
    memberIds: [],
  });
  const [savingGroup, setSavingGroup] = useState(false);
  const [groupMessage, setGroupMessage] = useState<string | null>(null);
  const [activeSplitTransactionId, setActiveSplitTransactionId] = useState<
    string | null
  >(null);
  const [splitEditor, setSplitEditor] = useState<{
    splitType: SplitType;
    splitData: SplitData;
  } | null>(null);
  const [displayCurrency, setDisplayCurrency] = useState("USD");
  const [supportedCurrencies, setSupportedCurrencies] = useState<string[]>([
    ...SUPPORTED_CURRENCIES,
  ]);
  const [loadingCurrencyPreference, setLoadingCurrencyPreference] =
    useState(false);
  const [savingCurrencyPreference, setSavingCurrencyPreference] =
    useState(false);
  const [resolvingRates, setResolvingRates] = useState(false);
  const [exchangeRateCache, setExchangeRateCache] = useState<
    Record<string, number>
  >({});
  const [focusedFieldKey, setFocusedFieldKey] = useState<string | null>(null);
  const [savedImportMapping, setSavedImportMapping] =
    useState<Partial<CsvColumnMapping> | null>(null);
  const [importState, setImportState] = useState<{
    fileName: string;
    parsed: ParsedCsvFile;
    mapping: CsvColumnMapping;
  } | null>(null);
  const [importCurrency, setImportCurrency] = useState("USD");
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    transactionId: string;
    transactionName: string;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importingCsv, setImportingCsv] = useState(false);

  const selectedGroup =
    groups.find((group) => group.id === selectedGroupId) ?? groups[0] ?? null;
  const memberById = useMemo(
    () =>
      new Map(
        (selectedGroup?.members || []).map((member) => [member.id, member]),
      ),
    [selectedGroup],
  );
  const activeSplitTransaction =
    transactions.find(
      (transaction) => transaction.id === activeSplitTransactionId,
    ) || null;
  const displayAmountsByTransactionId = useMemo(() => {
    const next: Record<string, number> = {};

    transactions.forEach((transaction) => {
      const amount = Number(transaction.amount || 0);
      const sourceCurrency = normalizeCurrency(transaction.currency);
      if (sourceCurrency === displayCurrency) {
        next[transaction.id] = amount;
        return;
      }

      const dateKey = getDateInputValue(transaction.transactionDate);
      const rateKey = exchangeRateCacheKey(
        dateKey,
        sourceCurrency,
        displayCurrency,
      );
      const rate = exchangeRateCache[rateKey];
      next[transaction.id] =
        typeof rate === "number" && Number.isFinite(rate) && rate > 0
          ? amount * rate
          : amount;
    });

    return next;
  }, [transactions, displayCurrency, exchangeRateCache]);
  const expenseSummary = useMemo(
    () =>
      selectedGroup
        ? buildGroupExpenseSummary(
            selectedGroup.members,
            transactions,
            (transaction) =>
              displayAmountsByTransactionId[transaction.id] ??
              Number(transaction.amount || 0),
          )
        : null,
    [selectedGroup, transactions, displayAmountsByTransactionId],
  );
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

  const fieldKey = (transactionId: string, field: string) =>
    `${transactionId}:${field}`;

  const isFocusedField = (key: string) => focusedFieldKey === key;

  const handleFieldFocus = (key: string) => {
    setFocusedFieldKey(key);
  };

  const handleFieldBlur = (key: string) => {
    setFocusedFieldKey((current) => (current === key ? null : current));
  };

  useEffect(() => {
    return () => {
      Object.keys(saveTimersRef.current).forEach(clearTransactionTimer);
    };
  }, []);

  const handleProfileImageUpload = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProfileMessage("Please select an image file");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setProfileForm((prev) => ({ ...prev, picture: result }));
      setProfileMessage("Image selected. Save profile to persist.");
    };
    reader.onerror = () => {
      setProfileMessage("Failed to read image file");
    };
    reader.readAsDataURL(file);
  };

  const applyProfile = (profile: Partial<ProfileForm>) => {
    setProfileForm({
      name: profile.name || "",
      email: profile.email || "",
      picture: profile.picture || "",
    });
  };

  const fetchProfile = async () => {
    try {
      setLoadingProfile(true);
      const profile = await apiCall("/api/me");
      applyProfile(profile);
    } catch (error) {
      console.error("Failed to fetch profile:", error);
    } finally {
      setLoadingProfile(false);
    }
  };

  const fetchGroups = async () => {
    try {
      setLoadingGroups(true);
      const [groupData, userData] = await Promise.all([
        apiCall("/api/batches"),
        apiCall("/api/users"),
      ]);
      const nextGroups = (groupData.batches || []) as Group[];
      const nextUsers = (userData.users || []) as GroupMember[];
      setGroups(nextGroups);
      setAvailableUsers(nextUsers);

      const routeId = getGroupIdFromPath();
      const hasSelectedGroup = nextGroups.some(
        (group) => group.id === selectedGroupId,
      );

      let nextSelectedGroupId = hasSelectedGroup ? selectedGroupId : null;

      if (!nextSelectedGroupId && routeId) {
        const routedGroup = nextGroups.find(
          (group) => group.id === routeId || group.id === `batch_${routeId}`,
        );
        nextSelectedGroupId = routedGroup?.id || null;
      }

      if (!nextSelectedGroupId) {
        nextSelectedGroupId = nextGroups[0]?.id || null;
      }

      setSelectedGroupId(nextSelectedGroupId);

      if (nextGroups.length === 0) {
        setCurrentView("dashboard");
        setShowGroupForm(true);
        setEditingGroupId(null);
        setGroupForm({ name: "", emoji: "💸", memberIds: [] });
      }
    } catch (error) {
      console.error("Failed to fetch groups:", error);
    } finally {
      setLoadingGroups(false);
    }
  };

  const fetchImportMapping = async () => {
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

  const fetchTransactions = async (group: Group) => {
    try {
      setLoadingData(true);
      console.info("[transactions] fetch start", {
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
      console.info("[transactions] fetch success", {
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

  const openCreateGroupForm = () => {
    setGroupMessage(null);
    setEditingGroupId(null);
    setGroupForm({ name: "", emoji: "💸", memberIds: [] });
    setShowGroupForm(true);
    setGroupMenuOpen(false);
  };

  const openEditGroupForm = (group: Group) => {
    setGroupMessage(null);
    setEditingGroupId(group.id);
    setGroupForm({
      id: group.id,
      name: group.name,
      emoji: group.emoji || "💸",
      memberIds: group.members.map((member) => member.id),
    });
    setShowGroupForm(true);
    setGroupMenuOpen(false);
  };

  const handleGroupMemberToggle = (memberId: string) => {
    setGroupForm((prev) => ({
      ...prev,
      memberIds: prev.memberIds.includes(memberId)
        ? prev.memberIds.filter((id) => id !== memberId)
        : [...prev.memberIds, memberId],
    }));
  };

  useEffect(() => {
    const groupIdFromPath = getGroupIdFromPath();
    if (groupIdFromPath) {
      setSelectedGroupId(groupIdFromPath);
      return;
    }

    const storedGroupId = window.localStorage.getItem("selectedGroupId");
    if (storedGroupId) {
      setSelectedGroupId(storedGroupId);
    }
  }, []);

  useEffect(() => {
    if (!selectedGroupId) {
      setGroupIdInPath(null);
      return;
    }

    window.localStorage.setItem("selectedGroupId", selectedGroupId);
    setGroupIdInPath(selectedGroupId);
  }, [selectedGroupId]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const init = async () => {
      try {
        console.debug("[app] ensuring user exists via /api/auth/login");
        await apiCall("/api/auth/login", { method: "POST" });
        await Promise.all([
          fetchProfile(),
          fetchGroups(),
          fetchImportMapping(),
        ]);
      } catch (error) {
        console.error("Failed to initialize app:", error);
      }
    };

    init();
  }, [isAuthenticated, apiCall]);

  useEffect(() => {
    if (!isAuthenticated || currentView !== "profile") return;
    fetchProfile();
  }, [currentView, isAuthenticated]);

  useEffect(() => {
    console.info("[transactions] selection effect", {
      selectedGroupId,
      selectedGroupResolvedId: selectedGroup?.id ?? null,
      showGroupForm,
      groupCount: groups.length,
    });

    if (!selectedGroup || showGroupForm) {
      setTransactions([]);
      setCategories([]);
      return;
    }

    fetchTransactions(selectedGroup);
  }, [selectedGroup, showGroupForm, groups.length, selectedGroupId]);

  useEffect(() => {
    if (!selectedGroup || showGroupForm) {
      return;
    }

    let cancelled = false;

    const loadCurrencyPreference = async () => {
      try {
        setLoadingCurrencyPreference(true);
        const response = await apiCall(
          `/api/batches/${selectedGroup.id}/currency-preference`,
        );
        if (cancelled) {
          return;
        }

        setDisplayCurrency(normalizeCurrency(response.currency));
        const next = normalizeSupportedCurrencies(response.supportedCurrencies);
        if (next.length > 0) {
          setSupportedCurrencies(next);
        }
      } catch (error) {
        console.error("Failed to fetch currency preference:", error);
      } finally {
        if (!cancelled) {
          setLoadingCurrencyPreference(false);
        }
      }
    };

    loadCurrencyPreference();

    return () => {
      cancelled = true;
    };
  }, [selectedGroup?.id, showGroupForm, apiCall]);

  useEffect(() => {
    if (!selectedGroup || transactions.length === 0) {
      return;
    }

    const missingByBase = new Map<string, Set<string>>();
    transactions.forEach((transaction) => {
      const sourceCurrency = normalizeCurrency(transaction.currency);
      if (sourceCurrency === displayCurrency) {
        return;
      }

      const date = getDateInputValue(transaction.transactionDate);
      const key = exchangeRateCacheKey(date, sourceCurrency, displayCurrency);
      if (exchangeRateCache[key]) {
        return;
      }

      const existing = missingByBase.get(sourceCurrency) || new Set<string>();
      existing.add(date);
      missingByBase.set(sourceCurrency, existing);
    });

    if (missingByBase.size === 0) {
      return;
    }

    let cancelled = false;

    const resolveRates = async () => {
      try {
        setResolvingRates(true);
        const responses = await Promise.all(
          Array.from(missingByBase.entries()).map(([baseCurrency, dates]) =>
            apiCall("/api/exchange-rates/resolve", {
              method: "POST",
              body: JSON.stringify({
                baseCurrency,
                targetCurrency: displayCurrency,
                dates: Array.from(dates),
              }),
            }),
          ),
        );

        if (cancelled) {
          return;
        }

        const nextRates: Record<string, number> = {};
        responses.forEach((response) => {
          const base = normalizeCurrency(response.baseCurrency);
          const target = normalizeCurrency(response.targetCurrency);
          const next = normalizeSupportedCurrencies(
            response.supportedCurrencies,
          );
          if (next.length > 0) {
            setSupportedCurrencies(next);
          }

          const ratesByDate =
            response.ratesByDate && typeof response.ratesByDate === "object"
              ? (response.ratesByDate as Record<string, number>)
              : {};
          Object.entries(ratesByDate).forEach(([date, rate]) => {
            if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
              nextRates[exchangeRateCacheKey(date, base, target)] = rate;
            }
          });
        });

        if (Object.keys(nextRates).length > 0) {
          setExchangeRateCache((prev) => ({ ...prev, ...nextRates }));
        }
      } catch (error) {
        console.error("Failed to resolve exchange rates:", error);
      } finally {
        if (!cancelled) {
          setResolvingRates(false);
        }
      }
    };

    resolveRates();

    return () => {
      cancelled = true;
    };
  }, [
    selectedGroup?.id,
    transactions,
    displayCurrency,
    exchangeRateCache,
    apiCall,
  ]);

  const updateDisplayCurrencyPreference = async (nextCurrency: string) => {
    if (!selectedGroup) {
      return;
    }

    const currency = normalizeCurrency(nextCurrency);
    setDisplayCurrency(currency);

    try {
      setSavingCurrencyPreference(true);
      const response = await apiCall(
        `/api/batches/${selectedGroup.id}/currency-preference`,
        {
          method: "PUT",
          body: JSON.stringify({ currency }),
        },
      );

      setDisplayCurrency(normalizeCurrency(response.currency));
      const next = normalizeSupportedCurrencies(response.supportedCurrencies);
      if (next.length > 0) {
        setSupportedCurrencies(next);
      }
    } catch (error) {
      console.error("Failed to update currency preference:", error);
    } finally {
      setSavingCurrencyPreference(false);
    }
  };

  const persistTransaction = async (
    transaction: Transaction,
    mode: "patch" | "create" = "patch",
  ) => {
    setSavingTransactions((prev) => ({ ...prev, [transaction.id]: true }));
    console.info("[transactions] persist start", {
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

        console.info("[transactions] create response", {
          draftId: transaction.id,
          createdId: response.spending?.id || response.id,
          hasSpending: !!response.spending,
        });

        if (response.spending && selectedGroup) {
          const normalized = normalizeTransaction(
            response.spending,
            selectedGroup,
          );
          setTransactions((prev) => [normalized, ...prev]);
          if (
            normalized.category &&
            !categories.includes(normalized.category)
          ) {
            setCategories((prev) => [...prev, normalized.category].sort());
          }
          console.info("[transactions] create stored", {
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

        if (selectedGroup) {
          const normalized = normalizeTransaction(response, selectedGroup);
          console.info("[transactions] patch response", {
            requestedId: transaction.id,
            returnedId: normalized.id,
            transaction: summarizeTransaction(normalized),
          });
          setTransactions((prev) =>
            prev.map((item) => (item.id === normalized.id ? normalized : item)),
          );
          if (
            normalized.category &&
            !categories.includes(normalized.category)
          ) {
            setCategories((prev) => [...prev, normalized.category].sort());
          }
        }
      }
    } catch (error) {
      console.error("[transactions] persist failed", {
        mode,
        transaction: summarizeTransaction(transaction),
        error,
      });
    } finally {
      setSavingTransactions((prev) => ({ ...prev, [transaction.id]: false }));
      console.info("[transactions] persist end", {
        mode,
        transactionId: transaction.id,
      });
    }
  };

  const scheduleTransactionSave = (transaction: Transaction) => {
    clearTransactionTimer(transaction.id);
    console.info("[transactions] schedule save", {
      transactionId: transaction.id,
      delayMs: 350,
      transaction: summarizeTransaction(transaction),
    });
    saveTimersRef.current[transaction.id] = window.setTimeout(() => {
      console.info("[transactions] debounce fired", {
        transactionId: transaction.id,
      });
      persistTransaction(transaction);
    }, 350);
  };

  const recordReimbursement = async (
    fromMemberId: string,
    toMemberId: string,
    amount: number,
  ) => {
    if (!selectedGroup) {
      return;
    }

    const memberIds = selectedGroup.members.map((member) => member.id);
    const dateStr = getDateInputValue();

    const reimbursementTransaction: Transaction = {
      id: `draft_${Date.now()}`,
      batchId: selectedGroup.id,
      amount: -amount,
      currency: displayCurrency,
      name: "Reimbursement",
      description: "",
      transactionDate: dateStr,
      category: "",
      paidById: fromMemberId,
      splitType: "percent",
      splitData: createReimbursementSplitData(
        memberIds,
        fromMemberId,
        toMemberId,
      ),
    };

    console.info("[transactions] record reimbursement", {
      fromMemberId,
      toMemberId,
      amount,
      transaction: summarizeTransaction(reimbursementTransaction),
    });

    await persistTransaction(reimbursementTransaction, "create");
  };

  const deleteTransaction = async (transactionId: string) => {
    console.info("[transactions] delete start", { transactionId });

    setSavingTransactions((prev) => ({ ...prev, [transactionId]: true }));

    try {
      await apiCall(`/api/spendings/${transactionId}`, {
        method: "DELETE",
      });

      setTransactions((prev) =>
        prev.filter((transaction) => transaction.id !== transactionId),
      );

      console.info("[transactions] delete success", { transactionId });
    } catch (error) {
      console.error("[transactions] delete failed", {
        transactionId,
        error,
      });
    } finally {
      setSavingTransactions((prev) => ({ ...prev, [transactionId]: false }));
      setDeleteConfirmation(null);
    }
  };

  const updateTransaction = (
    transactionId: string,
    updater: (transaction: Transaction) => Transaction,
  ) => {
    const current = transactions.find(
      (transaction) => transaction.id === transactionId,
    );

    if (!current) {
      console.warn("[transactions] update skipped; transaction not found", {
        transactionId,
        knownTransactionIds: transactions.map((transaction) => transaction.id),
      });
      return;
    }

    const nextTransaction = updater(current);

    console.info("[transactions] local update", {
      transactionId,
      before: summarizeTransaction(current),
      after: summarizeTransaction(nextTransaction),
    });

    setTransactions((prev) =>
      prev.map((transaction) =>
        transaction.id === transactionId ? nextTransaction : transaction,
      ),
    );

    scheduleTransactionSave(nextTransaction);
  };

  const createTransaction = async () => {
    if (!selectedGroup) {
      return;
    }

    const memberIds = selectedGroup.members.map((member) => member.id);
    const defaultDate = transactions[0]?.transactionDate || getDateInputValue();
    const currentUserId = getUserIdFromSub(user?.sub);
    const defaultPayer = memberIds.includes(currentUserId)
      ? currentUserId
      : memberIds[0] || "";
    const transaction: Transaction = {
      id: `draft_${Date.now()}`,
      batchId: selectedGroup.id,
      amount: 0,
      currency: displayCurrency,
      name: "",
      description: "",
      transactionDate: defaultDate,
      category: "",
      paidById: defaultPayer,
      splitType: "equal",
      splitData: createDefaultSplitData(memberIds),
    };

    console.info("[transactions] create draft", {
      groupId: selectedGroup.id,
      transaction: summarizeTransaction(transaction),
    });

    await persistTransaction(transaction, "create");
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
      setImportCurrency(displayCurrency);
      setImportError(null);
    } catch (error) {
      console.error("[transactions] csv parse failed", error);
      setImportError("Failed to parse the CSV file.");
    }
  };

  const handleImportCsv = async () => {
    if (!selectedGroup || !importState) {
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
          batchId: selectedGroup.id,
          rows: sanitizedRows,
          currency: importCurrency,
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
        normalizeTransaction(row, selectedGroup),
      );

      setTransactions((prev) => {
        const existing = new Set(prev.map((item) => item.id));
        const deduped = imported.filter((item) => !existing.has(item.id));
        return [...deduped, ...prev];
      });

      imported.forEach((item) => {
        if (item.category && !categories.includes(item.category)) {
          setCategories((prev) => [...prev, item.category].sort());
        }
      });

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

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMessage(null);

    try {
      setSavingProfile(true);
      const updated = await apiCall("/api/me", {
        method: "PATCH",
        body: JSON.stringify(profileForm),
      });
      applyProfile(updated);
      setProfileMessage("Profile saved");
    } catch (error) {
      console.error("Failed to update profile:", error);
      setProfileMessage(
        error instanceof Error ? error.message : "Failed to save profile",
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setGroupMessage(null);

    try {
      setSavingGroup(true);
      const endpoint = editingGroupId
        ? `/api/batches/${editingGroupId}`
        : "/api/batches";
      const method = editingGroupId ? "PATCH" : "POST";
      const response = await apiCall(endpoint, {
        method,
        body: JSON.stringify({
          name: groupForm.name,
          emoji: groupForm.emoji,
          memberIds: groupForm.memberIds,
        }),
      });

      setGroupMessage(editingGroupId ? "Group updated" : "Group created");
      setShowGroupForm(false);
      await fetchGroups();

      const newGroupId = editingGroupId
        ? response.id || editingGroupId
        : response.batch?.id || response.id;

      if (newGroupId) {
        setSelectedGroupId(newGroupId);
      }
    } catch (error) {
      console.error("Failed to save group:", error);
      setGroupMessage(
        error instanceof Error ? error.message : "Failed to save group",
      );
    } finally {
      setSavingGroup(false);
    }
  };

  const openAdvancedSplit = (transaction: Transaction) => {
    setActiveSplitTransactionId(transaction.id);
    setSplitEditor({
      splitType: transaction.splitType,
      splitData: {
        includedMemberIds: [...transaction.splitData.includedMemberIds],
        values: { ...transaction.splitData.values },
      },
    });
  };

  const handleSplitMemberToggle = (memberId: string) => {
    setSplitEditor((prev) => {
      if (!prev) return prev;

      const included = prev.splitData.includedMemberIds.includes(memberId)
        ? prev.splitData.includedMemberIds.filter((id) => id !== memberId)
        : [...prev.splitData.includedMemberIds, memberId];

      return {
        ...prev,
        splitData: {
          ...prev.splitData,
          includedMemberIds: included,
          values: {
            ...prev.splitData.values,
            [memberId]: prev.splitData.values[memberId] ?? 0,
          },
        },
      };
    });
  };

  const handleSplitValueChange = (memberId: string, value: string) => {
    setSplitEditor((prev) => {
      if (!prev) return prev;

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
    });
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-200">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-200">
      <header className="navbar sticky top-0 z-30 bg-base-100 border-b border-base-300">
        <div className="mx-auto flex w-full max-w-[110rem] px-4 md:px-6 justify-between gap-3">
          <button
            type="button"
            className="text-base md:text-lg font-semibold"
            onClick={() => setCurrentView("dashboard")}
          >
            Batch Spending Splitter
          </button>
          {isAuthenticated ? (
            <div className="flex items-center gap-2">
              {selectedGroup &&
                !showGroupForm &&
                currentView === "dashboard" && (
                  <div className="flex items-center gap-1">
                    <span className="hidden sm:inline text-xs text-base-content/70">
                      Currency
                    </span>
                    <select
                      className="select select-xs"
                      value={displayCurrency}
                      disabled={
                        loadingCurrencyPreference || savingCurrencyPreference
                      }
                      onChange={(event) =>
                        updateDisplayCurrencyPreference(event.target.value)
                      }
                    >
                      {supportedCurrencies.map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

              {currentView === "dashboard" &&
                !showGroupForm &&
                selectedGroup && (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={createTransaction}
                  >
                    Add expense
                  </button>
                )}

              <div
                className={`dropdown dropdown-end ${groupMenuOpen ? "dropdown-open" : ""}`}
              >
                <button
                  type="button"
                  className="btn btn-sm gap-2"
                  onClick={() => setGroupMenuOpen((open) => !open)}
                >
                  <span>{selectedGroup?.emoji || "💸"}</span>
                  <span className="max-w-40 truncate">
                    {loadingGroups
                      ? "Loading groups..."
                      : selectedGroup?.name || "Create your first group"}
                  </span>
                </button>
                <ul className="menu dropdown-content z-10 mt-2 w-64 rounded-box border border-base-300 bg-base-100 p-2 shadow-sm">
                  {groups.length > 0 ? (
                    groups.map((group) => (
                      <li key={group.id}>
                        <button
                          type="button"
                          className={
                            selectedGroupId === group.id ? "menu-active" : ""
                          }
                          onClick={() => {
                            setSelectedGroupId(group.id);
                            setGroupMenuOpen(false);
                          }}
                        >
                          <span>{group.emoji}</span>
                          <span>{group.name}</span>
                        </button>
                      </li>
                    ))
                  ) : (
                    <li className="menu-title">
                      <span>No groups yet</span>
                    </li>
                  )}
                  <li>
                    <button type="button" onClick={openCreateGroupForm}>
                      Create new group
                    </button>
                  </li>
                  {selectedGroup?.canEdit && (
                    <li>
                      <button
                        type="button"
                        onClick={() => openEditGroupForm(selectedGroup)}
                      >
                        Edit current group
                      </button>
                    </li>
                  )}
                </ul>
              </div>

              <div
                className={`dropdown dropdown-end ${profileMenuOpen ? "dropdown-open" : ""}`}
              >
                <button
                  type="button"
                  className="btn btn-sm gap-2"
                  onClick={() => setProfileMenuOpen((open) => !open)}
                >
                  <div className="avatar">
                    <div className="w-6 rounded-md bg-base-200">
                      {profileForm.picture ? (
                        <img src={profileForm.picture} alt="Profile" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-base-content/50">
                          U
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="text-sm text-base-content/70 hidden sm:inline max-w-40 truncate">
                    {profileForm.name ||
                      profileForm.email ||
                      user?.name ||
                      user?.email}
                  </span>
                </button>
                <ul className="menu dropdown-content z-10 mt-2 w-52 rounded-box border border-base-300 bg-base-100 p-2 shadow-sm">
                  <li>
                    <button
                      type="button"
                      className={currentView === "profile" ? "menu-active" : ""}
                      onClick={() => {
                        setCurrentView("profile");
                        setProfileMenuOpen(false);
                      }}
                    >
                      Profile
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        logout({
                          logoutParams: { returnTo: window.location.origin },
                        });
                      }}
                    >
                      Logout
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            <button
              onClick={() => loginWithRedirect()}
              className="btn btn-sm btn-primary"
            >
              Login with Auth0
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[110rem] py-4 px-4 md:px-6">
        {isAuthenticated ? (
          <div className="flex flex-col gap-3">
            {showGroupForm ? (
              <section className="card card-border bg-base-100 rounded-md w-full">
                <div className="card-body p-3 md:p-4 gap-3">
                  <h2 className="card-title text-base">
                    {editingGroupId ? "Update group" : "Create a new group"}
                  </h2>
                  <p className="text-sm text-base-content/70">
                    {groups.length === 0
                      ? "Before tracking expenses, create your first group and choose who belongs to it."
                      : "Set the group name, emoji, and members."}
                  </p>

                  <form
                    onSubmit={handleSaveGroup}
                    className="flex flex-col gap-3"
                  >
                    <fieldset className="fieldset">
                      <legend className="fieldset-legend">Group name</legend>
                      <input
                        className="input input-sm w-full"
                        value={groupForm.name}
                        onChange={(e) =>
                          setGroupForm((prev) => ({
                            ...prev,
                            name: e.target.value,
                          }))
                        }
                        placeholder="Weekend trip"
                        required
                      />
                    </fieldset>

                    <fieldset className="fieldset">
                      <legend className="fieldset-legend">Emoji</legend>
                      <input
                        className="input input-sm w-full"
                        value={groupForm.emoji}
                        onChange={(e) =>
                          setGroupForm((prev) => ({
                            ...prev,
                            emoji: e.target.value,
                          }))
                        }
                        placeholder="🏖️"
                        maxLength={4}
                        required
                      />
                    </fieldset>

                    <fieldset className="fieldset">
                      <legend className="fieldset-legend">Members</legend>
                      <div className="flex flex-col gap-2 rounded-md border border-base-300 p-3">
                        {availableUsers.map((member) => (
                          <label
                            key={member.id}
                            className="label cursor-pointer justify-start gap-3"
                          >
                            <input
                              type="checkbox"
                              className="checkbox checkbox-sm"
                              checked={groupForm.memberIds.includes(member.id)}
                              onChange={() =>
                                handleGroupMemberToggle(member.id)
                              }
                            />
                            <MemberIdentity member={member} showEmail />
                          </label>
                        ))}
                      </div>
                    </fieldset>

                    <div className="flex items-center gap-2">
                      <button type="submit" className="btn btn-sm btn-primary">
                        {savingGroup
                          ? "Saving..."
                          : editingGroupId
                            ? "Update group"
                            : "Create group"}
                      </button>
                      {groups.length > 0 && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => {
                            setShowGroupForm(false);
                            setEditingGroupId(null);
                            setGroupMessage(null);
                          }}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </form>

                  {groupMessage && (
                    <div className="alert alert-soft">
                      <span>{groupMessage}</span>
                    </div>
                  )}
                </div>
              </section>
            ) : currentView === "dashboard" ? (
              <>
                {selectedGroup ? (
                  <>
                    {expenseSummary && (
                      <section className="card card-border rounded-md bg-base-100 w-full">
                        <div className="card-body gap-3 p-3 md:p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h2 className="card-title text-base">
                              Group summary
                            </h2>
                            <span className="badge badge-soft badge-primary">
                              Total expenses:{" "}
                              {currencyLabel(
                                expenseSummary.totalExpenses,
                                displayCurrency,
                              )}
                            </span>
                          </div>
                          {resolvingRates && (
                            <p className="text-xs text-base-content/70">
                              Loading historical FX rates for the selected
                              display currency.
                            </p>
                          )}

                          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                            {selectedGroup.members.map((member) => {
                              const balance = expenseSummary.balances.find(
                                (item) => item.memberId === member.id,
                              );
                              const net = balance?.net ?? 0;
                              const tone =
                                net > 0.01
                                  ? "text-success"
                                  : net < -0.01
                                    ? "text-warning"
                                    : "text-base-content/70";

                              return (
                                <div
                                  key={member.id}
                                  className="rounded-md border border-base-300 p-2"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <MemberIdentity member={member} />
                                    <span
                                      className={`${tone} text-sm font-medium`}
                                    >
                                      {net > 0.01
                                        ? `is owed ${currencyLabel(net, displayCurrency)}`
                                        : net < -0.01
                                          ? `owes ${currencyLabel(Math.abs(net), displayCurrency)}`
                                          : "settled"}
                                    </span>
                                  </div>
                                  <div className="mt-1 text-xs text-base-content/70">
                                    Spent:{" "}
                                    {currencyLabel(
                                      balance?.paid ?? 0,
                                      displayCurrency,
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <div className="rounded-md border border-base-300 p-3">
                            <h3 className="text-sm font-semibold">
                              Optimized reimbursements
                            </h3>
                            <p className="text-xs text-base-content/70 mt-1">
                              {selectedGroup.members.length > 2
                                ? "Reimbursements are minimized to reduce the number of payments."
                                : "Reimbursement suggestion based on current balances."}
                            </p>
                            <div className="mt-2 flex flex-col gap-2">
                              {expenseSummary.settlements.length > 0 ? (
                                expenseSummary.settlements.map(
                                  (step, index) => {
                                    const from = memberById.get(
                                      step.fromMemberId,
                                    );
                                    const to = memberById.get(step.toMemberId);

                                    return (
                                      <div
                                        key={`${step.fromMemberId}-${step.toMemberId}-${index}`}
                                        className="flex flex-wrap items-center justify-between gap-2 text-sm"
                                      >
                                        <div className="flex flex-wrap items-center gap-2">
                                          {from ? (
                                            <MemberIdentity member={from} />
                                          ) : (
                                            <span>Unknown</span>
                                          )}
                                          <span className="text-base-content/70">
                                            pays
                                          </span>
                                          <span className="font-semibold">
                                            {currencyLabel(
                                              step.amount,
                                              displayCurrency,
                                            )}
                                          </span>
                                          <span className="text-base-content/70">
                                            to
                                          </span>
                                          {to ? (
                                            <MemberIdentity member={to} />
                                          ) : (
                                            <span>Unknown</span>
                                          )}
                                        </div>
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-primary"
                                          onClick={() =>
                                            recordReimbursement(
                                              step.fromMemberId,
                                              step.toMemberId,
                                              step.amount,
                                            )
                                          }
                                        >
                                          Record
                                        </button>
                                      </div>
                                    );
                                  },
                                )
                              ) : (
                                <p className="text-sm text-base-content/70">
                                  Everyone is settled. No reimbursements needed.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </section>
                    )}

                    <section className="card card-border rounded-md bg-base-100 min-w-0">
                      <div className="card-body gap-3 p-3 md:p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h2 className="card-title text-base">
                              Transactions
                            </h2>
                            <p className="text-sm text-base-content/70">
                              All spendings for this group in one editable
                              table.
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={openCsvPicker}
                            >
                              Import CSV
                            </button>
                            <span className="badge badge-soft badge-neutral">
                              {transactions.length} total
                            </span>
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

                        {loadingData ? (
                          <div className="flex justify-center py-4">
                            <span className="loading loading-spinner loading-md" />
                          </div>
                        ) : transactions.length > 0 ? (
                          <div className="overflow-x-auto rounded-md border border-base-300">
                            <table className="table table-zebra [&_td]:px-2 [&_td]:py-2 [&_th]:px-2 [&_th]:py-2">
                              <thead>
                                <tr>
                                  <th className="min-w-56">Name</th>
                                  <th className="min-w-24">Amount</th>
                                  <th className="min-w-24">Currency</th>
                                  <th className="min-w-32">Split</th>
                                  <th className="min-w-44">Paid by</th>
                                  <th className="min-w-36">Date</th>
                                  <th className="min-w-40">Category</th>
                                  <th className="min-w-72">Description</th>
                                  <th className="w-24">Status</th>
                                  <th className="w-20">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {transactions.map((transaction) => {
                                  const nameFieldKey = fieldKey(
                                    transaction.id,
                                    "name",
                                  );
                                  const amountFieldKey = fieldKey(
                                    transaction.id,
                                    "amount",
                                  );
                                  const currencyFieldKey = fieldKey(
                                    transaction.id,
                                    "currency",
                                  );
                                  const dateFieldKey = fieldKey(
                                    transaction.id,
                                    "date",
                                  );
                                  const categoryFieldKey = fieldKey(
                                    transaction.id,
                                    "category",
                                  );
                                  const descriptionFieldKey = fieldKey(
                                    transaction.id,
                                    "description",
                                  );
                                  const paidByMember =
                                    selectedGroup.members.find(
                                      (member) =>
                                        member.id === transaction.paidById,
                                    );

                                  return (
                                    <tr key={transaction.id}>
                                      <td>
                                        <input
                                          className="input input-sm w-full min-w-56"
                                          value={transaction.name}
                                          onFocus={() =>
                                            handleFieldFocus(nameFieldKey)
                                          }
                                          onBlur={() =>
                                            handleFieldBlur(nameFieldKey)
                                          }
                                          onChange={
                                            isFocusedField(nameFieldKey)
                                              ? (e) =>
                                                  updateTransaction(
                                                    transaction.id,
                                                    (item) => ({
                                                      ...item,
                                                      name: e.target.value,
                                                    }),
                                                  )
                                              : undefined
                                          }
                                          placeholder="Dinner"
                                        />
                                      </td>
                                      <td>
                                        <input
                                          className="input input-sm w-full min-w-24"
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={
                                            transaction.amount === 0
                                              ? ""
                                              : transaction.amount
                                          }
                                          placeholder="0.00"
                                          onFocus={() =>
                                            handleFieldFocus(amountFieldKey)
                                          }
                                          onBlur={() =>
                                            handleFieldBlur(amountFieldKey)
                                          }
                                          onChange={
                                            isFocusedField(amountFieldKey)
                                              ? (e) =>
                                                  updateTransaction(
                                                    transaction.id,
                                                    (item) => ({
                                                      ...item,
                                                      amount: Number(
                                                        e.target.value || 0,
                                                      ),
                                                    }),
                                                  )
                                              : undefined
                                          }
                                        />
                                      </td>
                                      <td>
                                        <select
                                          className="select select-sm w-full min-w-24"
                                          value={transaction.currency}
                                          onFocus={() =>
                                            handleFieldFocus(currencyFieldKey)
                                          }
                                          onBlur={() =>
                                            handleFieldBlur(currencyFieldKey)
                                          }
                                          onChange={
                                            isFocusedField(currencyFieldKey)
                                              ? (e) =>
                                                  updateTransaction(
                                                    transaction.id,
                                                    (item) => ({
                                                      ...item,
                                                      currency:
                                                        normalizeCurrency(
                                                          e.target.value,
                                                        ),
                                                    }),
                                                  )
                                              : undefined
                                          }
                                        >
                                          {supportedCurrencies.map(
                                            (currency) => (
                                              <option
                                                key={`${transaction.id}-${currency}`}
                                                value={currency}
                                              >
                                                {currency}
                                              </option>
                                            ),
                                          )}
                                        </select>
                                      </td>
                                      <td>
                                        <button
                                          type="button"
                                          className="btn btn-xs w-full min-w-32 justify-start"
                                          onClick={() =>
                                            openAdvancedSplit(transaction)
                                          }
                                        >
                                          {splitLabel(
                                            transaction,
                                            selectedGroup.members,
                                          )}
                                        </button>
                                      </td>
                                      <td>
                                        <details className="dropdown w-full min-w-44">
                                          <summary className="btn btn-sm w-full justify-start normal-case">
                                            {paidByMember ? (
                                              <MemberIdentity
                                                member={paidByMember}
                                              />
                                            ) : (
                                              <span className="text-xs text-base-content/60">
                                                Unknown payer
                                              </span>
                                            )}
                                          </summary>
                                          <ul className="menu dropdown-content z-20 mt-1 w-60 rounded-box border border-base-300 bg-base-100 p-2 shadow-sm">
                                            {selectedGroup.members.map(
                                              (member) => (
                                                <li key={member.id}>
                                                  <button
                                                    type="button"
                                                    className={
                                                      transaction.paidById ===
                                                      member.id
                                                        ? "menu-active"
                                                        : ""
                                                    }
                                                    onClick={(event) => {
                                                      updateTransaction(
                                                        transaction.id,
                                                        (item) => ({
                                                          ...item,
                                                          paidById: member.id,
                                                        }),
                                                      );

                                                      const dropdown =
                                                        event.currentTarget.closest(
                                                          "details",
                                                        ) as HTMLDetailsElement | null;
                                                      dropdown?.removeAttribute(
                                                        "open",
                                                      );
                                                    }}
                                                  >
                                                    <MemberIdentity
                                                      member={member}
                                                    />
                                                  </button>
                                                </li>
                                              ),
                                            )}
                                          </ul>
                                        </details>
                                      </td>
                                      <td>
                                        <input
                                          className="input input-sm w-full min-w-36"
                                          type="date"
                                          value={transaction.transactionDate}
                                          onFocus={() =>
                                            handleFieldFocus(dateFieldKey)
                                          }
                                          onBlur={() =>
                                            handleFieldBlur(dateFieldKey)
                                          }
                                          onChange={
                                            isFocusedField(dateFieldKey)
                                              ? (e) =>
                                                  updateTransaction(
                                                    transaction.id,
                                                    (item) => ({
                                                      ...item,
                                                      transactionDate:
                                                        e.target.value,
                                                    }),
                                                  )
                                              : undefined
                                          }
                                        />
                                      </td>
                                      <td>
                                        <input
                                          className="input input-sm w-full min-w-40"
                                          list="category-options"
                                          value={transaction.category}
                                          onFocus={() =>
                                            handleFieldFocus(categoryFieldKey)
                                          }
                                          onBlur={() =>
                                            handleFieldBlur(categoryFieldKey)
                                          }
                                          onChange={
                                            isFocusedField(categoryFieldKey)
                                              ? (e) =>
                                                  updateTransaction(
                                                    transaction.id,
                                                    (item) => ({
                                                      ...item,
                                                      category: e.target.value,
                                                    }),
                                                  )
                                              : undefined
                                          }
                                          placeholder="Food"
                                        />
                                      </td>
                                      <td>
                                        <input
                                          className="input input-sm w-full min-w-72"
                                          value={transaction.description}
                                          onFocus={() =>
                                            handleFieldFocus(
                                              descriptionFieldKey,
                                            )
                                          }
                                          onBlur={() =>
                                            handleFieldBlur(descriptionFieldKey)
                                          }
                                          onChange={
                                            isFocusedField(descriptionFieldKey)
                                              ? (e) =>
                                                  updateTransaction(
                                                    transaction.id,
                                                    (item) => ({
                                                      ...item,
                                                      description:
                                                        e.target.value,
                                                    }),
                                                  )
                                              : undefined
                                          }
                                          placeholder="Optional"
                                        />
                                      </td>
                                      <td>
                                        {savingTransactions[transaction.id] ? (
                                          <span className="loading loading-spinner loading-xs" />
                                        ) : (
                                          <span className="badge badge-soft badge-success badge-sm">
                                            Saved
                                          </span>
                                        )}
                                      </td>
                                      <td>
                                        <button
                                          type="button"
                                          className="btn btn-xs btn-ghost text-error"
                                          onClick={() =>
                                            setDeleteConfirmation({
                                              transactionId: transaction.id,
                                              transactionName: transaction.name,
                                            })
                                          }
                                        >
                                          Delete
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="alert alert-soft">
                            <span>
                              No transactions yet. Use Add expense to create the
                              first row for this group.
                            </span>
                          </div>
                        )}
                      </div>
                    </section>
                  </>
                ) : (
                  <div className="alert alert-soft">
                    <span>
                      Select or create a group to start adding transactions.
                    </span>
                  </div>
                )}
                <datalist id="category-options">
                  {categories.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
              </>
            ) : (
              <section className="card card-border bg-base-100 rounded-md w-full">
                <div className="card-body p-3 md:p-4 gap-3">
                  <h2 className="card-title text-base">Profile</h2>

                  <div className="flex items-center gap-3">
                    <div className="avatar">
                      <div className="w-14 rounded-md bg-base-200">
                        {profileForm.picture ? (
                          <img src={profileForm.picture} alt="Profile" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-base-content/50 text-sm">
                            No image
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-base-content/70">
                      Set your public profile details used inside the app.
                    </p>
                  </div>

                  <form
                    onSubmit={handleSaveProfile}
                    className="flex flex-col gap-3"
                  >
                    <fieldset className="fieldset">
                      <legend className="fieldset-legend">Name</legend>
                      <input
                        className="input input-sm w-full"
                        value={profileForm.name}
                        onChange={(e) =>
                          setProfileForm((prev) => ({
                            ...prev,
                            name: e.target.value,
                          }))
                        }
                        placeholder="Your display name"
                        maxLength={100}
                      />
                    </fieldset>

                    <fieldset className="fieldset">
                      <legend className="fieldset-legend">Email</legend>
                      <input
                        className="input input-sm w-full"
                        type="email"
                        value={profileForm.email}
                        onChange={(e) =>
                          setProfileForm((prev) => ({
                            ...prev,
                            email: e.target.value,
                          }))
                        }
                        placeholder="you@example.com"
                        required
                      />
                    </fieldset>

                    <fieldset className="fieldset">
                      <legend className="fieldset-legend">
                        Profile picture URL
                      </legend>
                      <input
                        className="input input-sm w-full"
                        type="url"
                        value={profileForm.picture}
                        onChange={(e) =>
                          setProfileForm((prev) => ({
                            ...prev,
                            picture: e.target.value,
                          }))
                        }
                        placeholder="https://example.com/photo.jpg"
                      />
                    </fieldset>

                    <fieldset className="fieldset">
                      <legend className="fieldset-legend">Upload image</legend>
                      <input
                        className="file-input file-input-sm w-full"
                        type="file"
                        accept="image/*"
                        onChange={(e) =>
                          handleProfileImageUpload(e.target.files?.[0])
                        }
                      />
                    </fieldset>

                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        className={`btn btn-sm btn-primary ${savingProfile ? "btn-disabled" : ""}`}
                      >
                        {savingProfile ? "Saving..." : "Save profile"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={fetchProfile}
                        disabled={loadingProfile}
                      >
                        {loadingProfile ? "Refreshing..." : "Reload"}
                      </button>
                    </div>
                  </form>

                  {profileMessage && (
                    <div className="alert alert-soft">
                      <span>{profileMessage}</span>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        ) : (
          <div className="card card-border bg-base-100 rounded-md">
            <div className="card-body p-4 md:p-5 items-center text-center">
              <h2 className="card-title">Welcome to Batch Spending Splitter</h2>
              <p className="text-base-content/70">
                Login to start tracking your spending and splitting with others.
              </p>
              <button
                onClick={() => loginWithRedirect()}
                className="btn btn-primary btn-sm"
              >
                Login with Auth0
              </button>
            </div>
          </div>
        )}
      </main>

      {activeSplitTransaction && splitEditor && selectedGroup && (
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
                  value={splitEditor.splitType}
                  onChange={(e) =>
                    setSplitEditor((prev) =>
                      prev
                        ? {
                            ...prev,
                            splitType: e.target.value as SplitType,
                          }
                        : prev,
                    )
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
                  {selectedGroup.members.map((member) => (
                    <label
                      key={member.id}
                      className="label cursor-pointer justify-start gap-3"
                    >
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={splitEditor.splitData.includedMemberIds.includes(
                          member.id,
                        )}
                        onChange={() => handleSplitMemberToggle(member.id)}
                      />
                      <MemberIdentity member={member} />
                    </label>
                  ))}
                </div>
              </fieldset>

              {splitEditor.splitType !== "equal" && (
                <fieldset className="fieldset">
                  <legend className="fieldset-legend">
                    {splitEditor.splitType === "amount"
                      ? "Exact amount per person"
                      : "Exact percentage per person"}
                  </legend>
                  <div className="flex flex-col gap-2 rounded-md border border-base-300 p-3">
                    {selectedGroup.members
                      .filter((member) =>
                        splitEditor.splitData.includedMemberIds.includes(
                          member.id,
                        ),
                      )
                      .map((member) => (
                        <label
                          key={member.id}
                          className="flex items-center gap-3"
                        >
                          <span className="min-w-48 text-sm">
                            <MemberIdentity member={member} />
                          </span>
                          <input
                            className="input input-sm w-full"
                            type="number"
                            min="0"
                            step="0.01"
                            value={splitEditor.splitData.values[member.id] || 0}
                            onChange={(e) =>
                              handleSplitValueChange(member.id, e.target.value)
                            }
                          />
                        </label>
                      ))}
                  </div>
                </fieldset>
              )}
            </div>

            <div className="modal-action">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setActiveSplitTransactionId(null);
                  setSplitEditor(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={saveAdvancedSplit}
              >
                Save split
              </button>
            </div>
          </div>
        </dialog>
      )}

      {importState && (
        <CsvImportModal
          fileName={importState.fileName}
          parsed={importState.parsed}
          mapping={importState.mapping}
          previewRows={sanitizedRows}
          validCount={sanitizedRows.length}
          invalidCount={Math.max(0, mappedRows.length - sanitizedRows.length)}
          selectedCurrency={importCurrency}
          currencies={supportedCurrencies}
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
          onCurrencyChange={(currency) =>
            setImportCurrency(normalizeCurrency(currency))
          }
          onCancel={() => {
            setImportState(null);
            setImportError(null);
          }}
          onImport={handleImportCsv}
        />
      )}

      {deleteConfirmation && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Delete transaction?</h3>
            <p className="py-4 text-sm">
              Are you sure you want to delete "
              {deleteConfirmation.transactionName}"? This action cannot be
              undone.
            </p>
            <div className="modal-action">
              <button
                type="button"
                className="btn"
                onClick={() => setDeleteConfirmation(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-error"
                onClick={() =>
                  deleteTransaction(deleteConfirmation.transactionId)
                }
              >
                Delete
              </button>
            </div>
          </div>
          <form
            method="dialog"
            className="modal-backdrop"
            onClick={() => setDeleteConfirmation(null)}
          >
            <button>close</button>
          </form>
        </dialog>
      )}
    </div>
  );
}

export default App;
