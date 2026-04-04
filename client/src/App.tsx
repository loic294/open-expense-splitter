import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApiCall } from "./api";

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

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function currencyLabel(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
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

function buildGroupExpenseSummary(
  members: GroupMember[],
  transactions: Transaction[],
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
    const amount = Number(transaction.amount || 0);
    if (amount <= 0) {
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
    .filter((balance) => balance.net > 0.009)
    .map((balance) => ({ ...balance }))
    .sort((a, b) => b.net - a.net);
  const debtors = normalizedBalances
    .filter((balance) => balance.net < -0.009)
    .map((balance) => ({ ...balance, net: Math.abs(balance.net) }))
    .sort((a, b) => b.net - a.net);

  const settlements: SettlementStep[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = roundCurrency(Math.min(creditor.net, debtor.net));

    if (amount > 0.009) {
      settlements.push({
        fromMemberId: debtor.memberId,
        toMemberId: creditor.memberId,
        amount,
      });
    }

    creditor.net = roundCurrency(creditor.net - amount);
    debtor.net = roundCurrency(debtor.net - amount);

    if (creditor.net <= 0.009) {
      creditorIndex += 1;
    }
    if (debtor.net <= 0.009) {
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

function createDefaultSplitData(memberIds: string[]): SplitData {
  return {
    includedMemberIds: memberIds,
    values: Object.fromEntries(memberIds.map((id) => [id, 0])),
  };
}

function normalizeTransaction(raw: any, group: Group | null): Transaction {
  const memberIds = group?.members.map((member) => member.id) || [];
  const splitData = raw.split_data || createDefaultSplitData(memberIds);

  return {
    id: raw.id,
    batchId: raw.batch_id,
    amount: Number(raw.amount || 0),
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

function App() {
  const { loginWithRedirect, logout, isAuthenticated, isLoading, user } =
    useAuth0();
  const apiCall = useApiCall();
  const saveTimersRef = useRef<Record<string, number>>({});

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
  const expenseSummary = useMemo(
    () =>
      selectedGroup
        ? buildGroupExpenseSummary(selectedGroup.members, transactions)
        : null,
    [selectedGroup, transactions],
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

      const hasSelectedGroup = nextGroups.some(
        (group) => group.id === selectedGroupId,
      );
      const nextSelectedGroupId = hasSelectedGroup
        ? selectedGroupId
        : nextGroups[0]?.id || null;

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
    const storedGroupId = window.localStorage.getItem("selectedGroupId");
    if (storedGroupId) {
      setSelectedGroupId(storedGroupId);
    }
  }, []);

  useEffect(() => {
    if (!selectedGroupId) return;
    window.localStorage.setItem("selectedGroupId", selectedGroupId);
  }, [selectedGroupId]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const init = async () => {
      try {
        console.debug("[app] ensuring user exists via /api/auth/login");
        await apiCall("/api/auth/login", { method: "POST" });
        await Promise.all([fetchProfile(), fetchGroups()]);
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
      <header className="navbar sticky top-0 z-30 bg-base-100 border-b border-base-300 px-4 md:px-6">
        <div className="mx-auto flex w-full max-w-[110rem] justify-between gap-3">
          <button
            type="button"
            className="text-base md:text-lg font-semibold"
            onClick={() => setCurrentView("dashboard")}
          >
            Batch Spending Splitter
          </button>
          {isAuthenticated ? (
            <div className="flex items-center gap-2">
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

      <main className="mx-auto w-full max-w-[110rem] p-3 md:p-4">
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
                              {currencyLabel(expenseSummary.totalExpenses)}
                            </span>
                          </div>

                          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                            {selectedGroup.members.map((member) => {
                              const balance = expenseSummary.balances.find(
                                (item) => item.memberId === member.id,
                              );
                              const net = balance?.net ?? 0;
                              const tone =
                                net > 0.009
                                  ? "text-success"
                                  : net < -0.009
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
                                      {net > 0.009
                                        ? `is owed ${currencyLabel(net)}`
                                        : net < -0.009
                                          ? `owes ${currencyLabel(Math.abs(net))}`
                                          : "settled"}
                                    </span>
                                  </div>
                                  <div className="mt-1 text-xs text-base-content/70">
                                    Spent: {currencyLabel(balance?.paid ?? 0)}
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
                                        className="flex flex-wrap items-center gap-2 text-sm"
                                      >
                                        {from ? (
                                          <MemberIdentity member={from} />
                                        ) : (
                                          <span>Unknown</span>
                                        )}
                                        <span className="text-base-content/70">
                                          pays
                                        </span>
                                        <span className="font-semibold">
                                          {currencyLabel(step.amount)}
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
                          <span className="badge badge-soft badge-neutral">
                            {transactions.length} total
                          </span>
                        </div>

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
                                  <th className="min-w-32">Split</th>
                                  <th className="min-w-44">Paid by</th>
                                  <th className="min-w-36">Date</th>
                                  <th className="min-w-40">Category</th>
                                  <th className="min-w-72">Description</th>
                                  <th className="w-24">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {transactions.map((transaction) => {
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
                                          onChange={(e) =>
                                            updateTransaction(
                                              transaction.id,
                                              (item) => ({
                                                ...item,
                                                name: e.target.value,
                                              }),
                                            )
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
                                          onChange={(e) =>
                                            updateTransaction(
                                              transaction.id,
                                              (item) => ({
                                                ...item,
                                                amount: Number(
                                                  e.target.value || 0,
                                                ),
                                              }),
                                            )
                                          }
                                        />
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
                                          onChange={(e) =>
                                            updateTransaction(
                                              transaction.id,
                                              (item) => ({
                                                ...item,
                                                transactionDate: e.target.value,
                                              }),
                                            )
                                          }
                                        />
                                      </td>
                                      <td>
                                        <input
                                          className="input input-sm w-full min-w-40"
                                          list="category-options"
                                          value={transaction.category}
                                          onChange={(e) =>
                                            updateTransaction(
                                              transaction.id,
                                              (item) => ({
                                                ...item,
                                                category: e.target.value,
                                              }),
                                            )
                                          }
                                          placeholder="Food"
                                        />
                                      </td>
                                      <td>
                                        <input
                                          className="input input-sm w-full min-w-72"
                                          value={transaction.description}
                                          onChange={(e) =>
                                            updateTransaction(
                                              transaction.id,
                                              (item) => ({
                                                ...item,
                                                description: e.target.value,
                                              }),
                                            )
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
    </div>
  );
}

export default App;
