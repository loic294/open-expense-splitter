import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useRef, useState } from "react";
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
  const activeSplitTransaction =
    transactions.find(
      (transaction) => transaction.id === activeSplitTransactionId,
    ) || null;

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
      const data = await apiCall(
        `/api/spendings?batchId=${encodeURIComponent(group.id)}`,
      );
      setTransactions(
        ((data.spendings || []) as any[]).map((transaction) =>
          normalizeTransaction(transaction, group),
        ),
      );
      setCategories((data.categories || []) as string[]);
    } catch (error) {
      console.error("Failed to fetch transactions:", error);
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
    if (!selectedGroup || showGroupForm) {
      setTransactions([]);
      setCategories([]);
      return;
    }

    fetchTransactions(selectedGroup);
  }, [selectedGroupId, showGroupForm]);

  const persistTransaction = async (
    transaction: Transaction,
    mode: "patch" | "create" = "patch",
  ) => {
    setSavingTransactions((prev) => ({ ...prev, [transaction.id]: true }));

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
      console.error("Failed to save transaction:", error);
    } finally {
      setSavingTransactions((prev) => ({ ...prev, [transaction.id]: false }));
    }
  };

  const scheduleTransactionSave = (transaction: Transaction) => {
    clearTransactionTimer(transaction.id);
    saveTimersRef.current[transaction.id] = window.setTimeout(() => {
      persistTransaction(transaction);
    }, 350);
  };

  const updateTransaction = (
    transactionId: string,
    updater: (transaction: Transaction) => Transaction,
  ) => {
    let nextTransaction: Transaction | null = null;

    setTransactions((prev) =>
      prev.map((transaction) => {
        if (transaction.id !== transactionId) {
          return transaction;
        }

        nextTransaction = updater(transaction);
        return nextTransaction;
      }),
    );

    if (nextTransaction) {
      scheduleTransactionSave(nextTransaction);
    }
  };

  const createTransaction = async () => {
    if (!selectedGroup) {
      return;
    }

    const memberIds = selectedGroup.members.map((member) => member.id);
    const defaultDate = transactions[0]?.transactionDate || getDateInputValue();
    const defaultPayer = memberIds[0] || "";
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
      <header className="navbar bg-base-100 border-b border-base-300 px-4 md:px-6">
        <div className="w-full max-w-6xl mx-auto flex justify-between gap-3">
          <button
            type="button"
            className="text-base md:text-lg font-semibold"
            onClick={() => setCurrentView("dashboard")}
          >
            Batch Spending Splitter
          </button>
          {isAuthenticated ? (
            <div className="flex items-center gap-2">
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

      <main className="max-w-6xl mx-auto w-full p-3 md:p-4">
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
                            <span>
                              {memberName(member)}
                              {member.email ? ` (${member.email})` : ""}
                            </span>
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
                {selectedGroup && (
                  <section className="card card-border bg-base-100 rounded-md w-full">
                    <div className="card-body p-3 md:p-4 gap-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xl">
                              {selectedGroup.emoji}
                            </span>
                            <h2 className="card-title text-base">
                              {selectedGroup.name}
                            </h2>
                          </div>
                          <p className="text-sm text-base-content/70">
                            {selectedGroup.members.length} member(s)
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
                )}

                {selectedGroup ? (
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
                                  <legend className="fieldset-legend">
                                    Amount
                                  </legend>
                                  <input
                                    className="input input-sm w-full"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={transaction.amount}
                                    onChange={(e) =>
                                      updateTransaction(
                                        transaction.id,
                                        (item) => ({
                                          ...item,
                                          amount: Number(e.target.value || 0),
                                        }),
                                      )
                                    }
                                  />
                                </fieldset>

                                <fieldset className="fieldset">
                                  <legend className="fieldset-legend">
                                    Name
                                  </legend>
                                  <input
                                    className="input input-sm w-full"
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
                                </fieldset>

                                <fieldset className="fieldset">
                                  <legend className="fieldset-legend">
                                    Description
                                  </legend>
                                  <input
                                    className="input input-sm w-full"
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
                                </fieldset>

                                <fieldset className="fieldset">
                                  <legend className="fieldset-legend">
                                    Transaction date
                                  </legend>
                                  <input
                                    className="input input-sm w-full"
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
                                </fieldset>

                                <fieldset className="fieldset">
                                  <legend className="fieldset-legend">
                                    Category
                                  </legend>
                                  <input
                                    className="input input-sm w-full"
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
                                </fieldset>

                                <fieldset className="fieldset">
                                  <legend className="fieldset-legend">
                                    Split
                                  </legend>
                                  <button
                                    type="button"
                                    className="btn btn-sm justify-start"
                                    onClick={() =>
                                      openAdvancedSplit(transaction)
                                    }
                                  >
                                    {splitLabel(
                                      transaction,
                                      selectedGroup.members,
                                    )}
                                  </button>
                                </fieldset>

                                <fieldset className="fieldset">
                                  <legend className="fieldset-legend">
                                    Paid by
                                  </legend>
                                  <select
                                    className="select select-sm w-full"
                                    value={transaction.paidById}
                                    onChange={(e) =>
                                      updateTransaction(
                                        transaction.id,
                                        (item) => ({
                                          ...item,
                                          paidById: e.target.value,
                                        }),
                                      )
                                    }
                                  >
                                    {selectedGroup.members.map((member) => (
                                      <option key={member.id} value={member.id}>
                                        {memberName(member)}
                                      </option>
                                    ))}
                                  </select>
                                </fieldset>

                                <fieldset className="fieldset">
                                  <legend className="fieldset-legend">
                                    Advanced
                                  </legend>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      className="btn btn-sm"
                                      onClick={() =>
                                        openAdvancedSplit(transaction)
                                      }
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
                            No transactions yet. Create one to start tracking
                            this group.
                          </span>
                        </div>
                      )}
                    </div>
                  </section>
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
                      <span>{memberName(member)}</span>
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
                          <span className="min-w-32 text-sm">
                            {memberName(member)}
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
