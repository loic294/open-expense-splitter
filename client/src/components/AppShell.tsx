import { useAuth0 } from "@auth0/auth0-react";
import { useState } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import logo from "../assets/OpenExpenseSplitterLogo.svg";
import { useAppData } from "../context/AppDataContext";
import NavbarActionsContext from "../context/NavbarActionsContext";
import Footer from "./Footer";

export default function AppShell() {
  const { logout, user } = useAuth0();
  const {
    groups,
    loadingGroups,
    profile,
    getGroupById,
    getPreferredGroupId,
    rememberGroupId,
  } = useAppData();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [navbarActionsEl, setNavbarActionsEl] = useState<HTMLDivElement | null>(
    null,
  );

  const currentGroup = getGroupById(params.groupId);
  const fallbackGroup = getGroupById(getPreferredGroupId());
  const activeGroup = currentGroup || fallbackGroup;
  const isProfileRoute = location.pathname === "/profile";

  return (
    <NavbarActionsContext.Provider value={navbarActionsEl}>
      <div className="flex flex-col min-h-screen bg-base-200">
        <header className="navbar bg-base-100 border-b border-base-300 px-4 md:px-6 sticky top-0 z-10 shadow-sm">
          <div className="w-full flex justify-between gap-3">
            <button
              type="button"
              className="flex items-center gap-2 text-base md:text-lg font-semibold"
              onClick={() => {
                const nextGroupId = activeGroup?.id || getPreferredGroupId();
                navigate(nextGroupId ? `/groups/${nextGroupId}` : "/");
              }}
            >
              <img
                src={logo}
                alt="Open Expense Splitter logo"
                className="h-8 w-8"
              />
              <span>Open Expense Splitter</span>
            </button>

            <div className="flex items-center gap-2">
              <div
                ref={(el) => setNavbarActionsEl(el)}
                className="flex items-center gap-2"
              />
              <details className="dropdown dropdown-end">
                <summary className="btn btn-sm gap-2">
                  <span>{activeGroup?.emoji || "💸"}</span>
                  <span className="max-w-40 truncate">
                    {loadingGroups
                      ? "Loading groups..."
                      : activeGroup?.name || "Create your first group"}
                  </span>
                </summary>
                <ul className="menu dropdown-content z-50 mt-2 w-64 rounded-box border border-base-300 bg-base-100 p-2 shadow-sm">
                  {groups.length > 0 ? (
                    groups.map((group) => (
                      <li key={group.id}>
                        <button
                          type="button"
                          className={
                            activeGroup?.id === group.id ? "menu-active" : ""
                          }
                          onClick={() => {
                            rememberGroupId(group.id);
                            navigate(`/groups/${group.id}`);
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
                    <button
                      type="button"
                      onClick={() => {
                        navigate("/groups/new");
                      }}
                    >
                      Create new group
                    </button>
                  </li>
                  {activeGroup?.canEdit && (
                    <li>
                      <button
                        type="button"
                        onClick={() => {
                          navigate(`/groups/${activeGroup.id}/edit`);
                        }}
                      >
                        Group settings
                      </button>
                    </li>
                  )}
                </ul>
              </details>

              <details className="dropdown dropdown-end">
                <summary className="btn btn-sm gap-2">
                  <div className="avatar">
                    <div className="w-6 rounded-md bg-base-200">
                      {profile.picture ? (
                        <img src={profile.picture} alt="Profile" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-base-content/50">
                          U
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="text-sm text-base-content/70 hidden sm:inline max-w-40 truncate">
                    {profile.name || profile.email || user?.name || user?.email}
                  </span>
                </summary>
                <ul className="menu dropdown-content z-50 mt-2 w-52 rounded-box border border-base-300 bg-base-100 p-2 shadow-sm">
                  <li>
                    <button
                      type="button"
                      className={isProfileRoute ? "menu-active" : ""}
                      onClick={() => {
                        navigate("/profile");
                      }}
                    >
                      Profile
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        logout({
                          logoutParams: { returnTo: window.location.origin },
                        });
                      }}
                    >
                      Logout
                    </button>
                  </li>
                </ul>
              </details>
            </div>
          </div>
        </header>

        <main className="w-full p-3 md:p-4 flex-1">
          <Outlet />
        </main>

        <div className="p-4">
          <Footer />
        </div>
      </div>
    </NavbarActionsContext.Provider>
  );
}
