import { useAuth0 } from "@auth0/auth0-react";
import { useState, useEffect } from "react";
import { useApiCall } from "./api";

type PageView = "dashboard" | "profile";

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

function App() {
  const { loginWithRedirect, logout, isAuthenticated, isLoading, user } =
    useAuth0();
  const [spendings, setSpendings] = useState<any[]>([]);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [loadingData, setLoadingData] = useState(false);
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
  const apiCall = useApiCall();

  const selectedGroup =
    groups.find((group) => group.id === selectedGroupId) ?? groups[0] ?? null;

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

  // Fetch spendings when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    const initAndFetchSpendings = async () => {
      try {
        setLoadingData(true);
        console.debug("[app] ensuring user exists via /api/auth/login");
        await apiCall("/api/auth/login", { method: "POST" });
        console.debug("[app] user ensured, fetching /api/spendings");
        const [spendingData, profileData] = await Promise.all([
          apiCall("/api/spendings"),
          apiCall("/api/me"),
        ]);
        setSpendings(spendingData.spendings || []);
        applyProfile(profileData);
        await fetchGroups();
      } catch (error) {
        console.error("Failed to fetch spendings:", error);
      } finally {
        setLoadingData(false);
      }
    };

    initAndFetchSpendings();
  }, [isAuthenticated, apiCall]);

  useEffect(() => {
    if (!isAuthenticated || currentView !== "profile") return;
    fetchProfile();
  }, [currentView, isAuthenticated]);

  useEffect(() => {
    if (!selectedGroupId) return;
    window.localStorage.setItem("selectedGroupId", selectedGroupId);
  }, [selectedGroupId]);

  useEffect(() => {
    const storedGroupId = window.localStorage.getItem("selectedGroupId");
    if (storedGroupId) {
      setSelectedGroupId(storedGroupId);
    }
  }, []);

  const handleAddSpending = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !description) return;

    try {
      await apiCall("/api/spendings", {
        method: "POST",
        body: JSON.stringify({
          amount: parseFloat(amount),
          description,
        }),
      });
      setAmount("");
      setDescription("");
      // Refresh spendings
      const data = await apiCall("/api/spendings");
      setSpendings(data.spendings || []);
    } catch (error) {
      console.error("Failed to add spending:", error);
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
      const payload = {
        name: groupForm.name,
        emoji: groupForm.emoji,
        memberIds: groupForm.memberIds,
      };

      const response = await apiCall(endpoint, {
        method,
        body: JSON.stringify(payload),
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
        <div className="w-full max-w-5xl mx-auto flex justify-between">
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
                  <span className="max-w-36 truncate">
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

      <main className="max-w-5xl mx-auto w-full p-3 md:p-4">
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
                              {member.name || member.email}
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
                    <div className="card-body p-3 md:p-4 gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{selectedGroup.emoji}</span>
                        <h2 className="card-title text-base">
                          {selectedGroup.name}
                        </h2>
                      </div>
                      <p className="text-sm text-base-content/70">
                        {selectedGroup.members.length} member(s) in this group.
                      </p>
                    </div>
                  </section>
                )}
                <section className="card card-border bg-base-100 rounded-md w-full">
                  <div className="card-body p-3 md:p-4 gap-3">
                    <h2 className="card-title text-base">Add Spending</h2>
                    <form
                      onSubmit={handleAddSpending}
                      className="flex flex-col gap-3"
                    >
                      <fieldset className="fieldset">
                        <legend className="fieldset-legend">Description</legend>
                        <input
                          id="description"
                          type="text"
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="What did you spend on?"
                          className="input input-sm w-full"
                          required
                        />
                      </fieldset>

                      <fieldset className="fieldset">
                        <legend className="fieldset-legend">Amount</legend>
                        <input
                          id="amount"
                          type="number"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="0.00"
                          step="0.01"
                          min="0"
                          className="input input-sm w-full"
                          required
                        />
                      </fieldset>

                      <div>
                        <button
                          type="submit"
                          className="btn btn-sm btn-primary"
                        >
                          Add Spending
                        </button>
                      </div>
                    </form>
                  </div>
                </section>

                <section className="card card-border bg-base-100 rounded-md w-full">
                  <div className="card-body p-3 md:p-4 gap-3">
                    <h2 className="card-title text-base">Your Spendings</h2>
                    {loadingData ? (
                      <div className="flex justify-center py-4">
                        <span className="loading loading-spinner loading-md" />
                      </div>
                    ) : spendings.length > 0 ? (
                      <ul className="list gap-2">
                        {spendings.map((spending) => (
                          <li
                            key={spending.id}
                            className="list-row rounded-md border border-base-300 bg-base-100 px-3 py-2"
                          >
                            <div className="font-medium">
                              {spending.description}
                            </div>
                            <div className="text-right font-semibold tabular-nums">
                              ${spending.amount.toFixed(2)}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="alert alert-soft">
                        <span>No spendings yet. Add one to get started!</span>
                      </div>
                    )}
                  </div>
                </section>
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
    </div>
  );
}

export default App;
