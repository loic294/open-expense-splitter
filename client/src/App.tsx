import { useAuth0 } from "@auth0/auth0-react";
import { useState, useEffect } from "react";
import { useApiCall } from "./api";

type PageView = "dashboard" | "profile";

interface ProfileForm {
  name: string;
  email: string;
  picture: string;
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
  const apiCall = useApiCall();

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
            {currentView === "dashboard" ? (
              <>
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
