import { useAuth0 } from "@auth0/auth0-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { isAuthenticationFailure, useApiCall } from "../api";
import type {
  ContactInvite,
  Group,
  GroupForm,
  GroupMember,
  ProfileForm,
  TransactionColumnType,
} from "../types";
import { getBaseUrl, isUnauthenticatedPath } from "../utils/authRoutes";

interface AppDataContextValue {
  bootstrapping: boolean;
  groups: Group[];
  contacts: GroupMember[];
  platformInvites: ContactInvite[];
  availableUsers: GroupMember[];
  loadingGroups: boolean;
  profile: ProfileForm;
  loadingProfile: boolean;
  refreshContacts: () => Promise<GroupMember[]>;
  createPlatformInvite: (email?: string) => Promise<ContactInvite>;
  acceptPlatformInvite: (token: string) => Promise<void>;
  getGroupMemberInvites: (groupId: string) => Promise<ContactInvite[]>;
  acceptGroupInvite: (token: string) => Promise<{ groupId: string }>;
  refreshProfile: () => Promise<ProfileForm | null>;
  saveProfile: (profile: ProfileForm) => Promise<ProfileForm>;
  refreshGroups: () => Promise<Group[]>;
  saveGroup: (
    form: GroupForm,
    groupId?: string | null,
  ) => Promise<{
    groupId: string | null;
    generatedInvites: ContactInvite[];
    pendingInvites: ContactInvite[];
  }>;
  getGroupById: (groupId?: string | null) => Group | null;
  rememberGroupId: (groupId: string) => void;
  getPreferredGroupId: () => string | null;
  saveVisibleColumns: (
    groupId: string,
    visibleColumns: TransactionColumnType[],
  ) => Promise<void>;
}

const defaultProfile: ProfileForm = {
  name: "",
  email: "",
  picture: "",
};

const AppDataContext = createContext<AppDataContextValue | null>(null);

function readRememberedGroupId() {
  return window.localStorage.getItem("selectedGroupId");
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, logout } = useAuth0();
  const apiCall = useApiCall();
  const [bootstrapping, setBootstrapping] = useState(true);
  const [groups, setGroups] = useState<Group[]>([]);
  const [contacts, setContacts] = useState<GroupMember[]>([]);
  const [platformInvites, setPlatformInvites] = useState<ContactInvite[]>([]);
  const [availableUsers, setAvailableUsers] = useState<GroupMember[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [profile, setProfile] = useState<ProfileForm>(defaultProfile);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const rememberGroupId = useCallback((groupId: string) => {
    window.localStorage.setItem("selectedGroupId", groupId);
  }, []);

  const getPreferredGroupId = useCallback(() => {
    const rememberedId = readRememberedGroupId();
    if (rememberedId && groups.some((group) => group.id === rememberedId)) {
      return rememberedId;
    }

    return groups[0]?.id || null;
  }, [groups]);

  const refreshProfile = useCallback(async () => {
    try {
      setLoadingProfile(true);
      const nextProfile = (await apiCall("/api/me")) as Partial<ProfileForm>;
      const normalizedProfile = {
        name: nextProfile.name || "",
        email: nextProfile.email || "",
        picture: nextProfile.picture || "",
      };
      setProfile(normalizedProfile);
      return normalizedProfile;
    } catch (error) {
      console.error("Failed to fetch profile:", error);
      return null;
    } finally {
      setLoadingProfile(false);
    }
  }, [apiCall]);

  const saveProfile = useCallback(
    async (nextProfile: ProfileForm) => {
      const updated = (await apiCall("/api/me", {
        method: "PATCH",
        body: JSON.stringify(nextProfile),
      })) as Partial<ProfileForm>;

      const normalizedProfile = {
        name: updated.name || "",
        email: updated.email || "",
        picture: updated.picture || "",
      };
      setProfile(normalizedProfile);
      return normalizedProfile;
    },
    [apiCall],
  );

  const refreshGroups = useCallback(async () => {
    try {
      setLoadingGroups(true);
      const groupData = await apiCall("/api/groups");
      const nextGroups = (groupData.batches || []) as Group[];
      setGroups(nextGroups);
      return nextGroups;
    } catch (error) {
      console.error("Failed to fetch groups:", error);
      return [];
    } finally {
      setLoadingGroups(false);
    }
  }, [apiCall]);

  const refreshContacts = useCallback(async () => {
    try {
      const data = await apiCall("/api/contacts");
      const nextContacts = (data.contacts || []) as GroupMember[];
      const nextInvites = (data.sentInvites || []) as ContactInvite[];
      setContacts(nextContacts);
      setPlatformInvites(nextInvites);
      setAvailableUsers(nextContacts);
      return nextContacts;
    } catch (error) {
      console.error("Failed to fetch contacts:", error);
      return [];
    }
  }, [apiCall]);

  const createPlatformInvite = useCallback(
    async (email?: string) => {
      const invite = (await apiCall("/api/contacts/invites", {
        method: "POST",
        body: JSON.stringify({ email: email || undefined }),
      })) as ContactInvite;

      await refreshContacts();
      return invite;
    },
    [apiCall, refreshContacts],
  );

  const acceptPlatformInvite = useCallback(
    async (token: string) => {
      await apiCall(
        `/api/platform-invites/${encodeURIComponent(token)}/accept`,
        {
          method: "POST",
        },
      );
      await Promise.all([refreshContacts(), refreshGroups()]);
    },
    [apiCall, refreshContacts, refreshGroups],
  );

  const getGroupMemberInvites = useCallback(
    async (groupId: string) => {
      const response = (await apiCall(
        `/api/groups/${encodeURIComponent(groupId)}/member-invites`,
      )) as { invites?: ContactInvite[] };

      return (response.invites || []) as ContactInvite[];
    },
    [apiCall],
  );

  const acceptGroupInvite = useCallback(
    async (token: string) => {
      const response = (await apiCall(
        `/api/group-invites/${encodeURIComponent(token)}/accept`,
        {
          method: "POST",
        },
      )) as { groupId: string };

      await Promise.all([refreshContacts(), refreshGroups()]);
      return response;
    },
    [apiCall, refreshContacts, refreshGroups],
  );

  const saveGroup = useCallback(
    async (form: GroupForm, groupId?: string | null) => {
      const endpoint = groupId ? `/api/groups/${groupId}` : "/api/groups";
      const method = groupId ? "PATCH" : "POST";
      const response = await apiCall(endpoint, {
        method,
        body: JSON.stringify({
          name: form.name,
          emoji: form.emoji,
          memberIds: form.memberIds,
          inviteEmails: form.inviteEmails,
          temporaryMembers: form.temporaryMembers,
        }),
      });

      await refreshGroups();

      const nextGroupId = groupId
        ? response.id || groupId
        : response.batch?.id || response.id || null;

      if (nextGroupId) {
        rememberGroupId(nextGroupId);
      }

      return {
        groupId: nextGroupId,
        generatedInvites: (response.generatedInvites ||
          response.pendingInvites ||
          []) as ContactInvite[],
        pendingInvites: (response.pendingInvites || []) as ContactInvite[],
      };
    },
    [apiCall, refreshGroups, rememberGroupId],
  );

  const getGroupById = useCallback(
    (groupId?: string | null) => {
      if (!groupId) {
        return null;
      }

      return groups.find((group) => group.id === groupId) || null;
    },
    [groups],
  );

  const saveVisibleColumns = useCallback(
    async (groupId: string, visibleColumns: TransactionColumnType[]) => {
      await apiCall(`/api/groups/${groupId}/column-visibility`, {
        method: "PUT",
        body: JSON.stringify({ visibleColumns }),
      });

      setGroups((prev) =>
        prev.map((group) =>
          group.id === groupId ? { ...group, visibleColumns } : group,
        ),
      );
    },
    [apiCall],
  );

  useEffect(() => {
    if (!isAuthenticated) {
      setBootstrapping(false);
      setGroups([]);
      setContacts([]);
      setPlatformInvites([]);
      setAvailableUsers([]);
      setProfile(defaultProfile);
      return;
    }

    const initialize = async () => {
      try {
        setBootstrapping(true);
        await apiCall("/api/auth/login", { method: "POST" });
        await Promise.all([
          refreshProfile(),
          refreshGroups(),
          refreshContacts(),
        ]);
      } catch (error) {
        console.error("Failed to initialize app:", error);

        if (isAuthenticationFailure(error)) {
          const returnTo = getBaseUrl();

          if (!isUnauthenticatedPath(window.location.pathname)) {
            logout({ logoutParams: { returnTo } });
            return;
          }

          window.location.replace(returnTo);
          return;
        }
      } finally {
        setBootstrapping(false);
      }
    };

    initialize();
  }, [
    isAuthenticated,
    logout,
    apiCall,
    refreshGroups,
    refreshProfile,
    refreshContacts,
  ]);

  const value = useMemo<AppDataContextValue>(
    () => ({
      bootstrapping,
      groups,
      contacts,
      platformInvites,
      availableUsers,
      loadingGroups,
      profile,
      loadingProfile,
      refreshContacts,
      createPlatformInvite,
      acceptPlatformInvite,
      getGroupMemberInvites,
      acceptGroupInvite,
      refreshProfile,
      saveProfile,
      refreshGroups,
      saveGroup,
      getGroupById,
      rememberGroupId,
      getPreferredGroupId,
      saveVisibleColumns,
    }),
    [
      bootstrapping,
      groups,
      contacts,
      platformInvites,
      availableUsers,
      loadingGroups,
      profile,
      loadingProfile,
      refreshContacts,
      createPlatformInvite,
      acceptPlatformInvite,
      getGroupMemberInvites,
      acceptGroupInvite,
      refreshProfile,
      saveProfile,
      refreshGroups,
      saveGroup,
      getGroupById,
      rememberGroupId,
      getPreferredGroupId,
      saveVisibleColumns,
    ],
  );

  return (
    <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
  );
}

export function useAppData() {
  const context = useContext(AppDataContext);

  if (!context) {
    throw new Error("useAppData must be used within AppDataProvider");
  }

  return context;
}
