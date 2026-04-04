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
import { useApiCall } from "../api";
import type { Group, GroupForm, GroupMember, ProfileForm } from "../types";

interface AppDataContextValue {
  bootstrapping: boolean;
  groups: Group[];
  availableUsers: GroupMember[];
  loadingGroups: boolean;
  profile: ProfileForm;
  loadingProfile: boolean;
  refreshProfile: () => Promise<ProfileForm | null>;
  saveProfile: (profile: ProfileForm) => Promise<ProfileForm>;
  refreshGroups: () => Promise<Group[]>;
  saveGroup: (
    form: GroupForm,
    groupId?: string | null,
  ) => Promise<string | null>;
  getGroupById: (groupId?: string | null) => Group | null;
  rememberGroupId: (groupId: string) => void;
  getPreferredGroupId: () => string | null;
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
  const { isAuthenticated } = useAuth0();
  const apiCall = useApiCall();
  const [bootstrapping, setBootstrapping] = useState(true);
  const [groups, setGroups] = useState<Group[]>([]);
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
      const [groupData, userData] = await Promise.all([
        apiCall("/api/batches"),
        apiCall("/api/users"),
      ]);
      const nextGroups = (groupData.batches || []) as Group[];
      const nextUsers = (userData.users || []) as GroupMember[];
      setGroups(nextGroups);
      setAvailableUsers(nextUsers);
      return nextGroups;
    } catch (error) {
      console.error("Failed to fetch groups:", error);
      return [];
    } finally {
      setLoadingGroups(false);
    }
  }, [apiCall]);

  const saveGroup = useCallback(
    async (form: GroupForm, groupId?: string | null) => {
      const endpoint = groupId ? `/api/batches/${groupId}` : "/api/batches";
      const method = groupId ? "PATCH" : "POST";
      const response = await apiCall(endpoint, {
        method,
        body: JSON.stringify({
          name: form.name,
          emoji: form.emoji,
          memberIds: form.memberIds,
        }),
      });

      await refreshGroups();

      const nextGroupId = groupId
        ? response.id || groupId
        : response.batch?.id || response.id || null;

      if (nextGroupId) {
        rememberGroupId(nextGroupId);
      }

      return nextGroupId;
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

  useEffect(() => {
    if (!isAuthenticated) {
      setBootstrapping(false);
      setGroups([]);
      setAvailableUsers([]);
      setProfile(defaultProfile);
      return;
    }

    const initialize = async () => {
      try {
        setBootstrapping(true);
        await apiCall("/api/auth/login", { method: "POST" });
        await Promise.all([refreshProfile(), refreshGroups()]);
      } catch (error) {
        console.error("Failed to initialize app:", error);
      } finally {
        setBootstrapping(false);
      }
    };

    initialize();
  }, [isAuthenticated, apiCall, refreshGroups, refreshProfile]);

  const value = useMemo<AppDataContextValue>(
    () => ({
      bootstrapping,
      groups,
      availableUsers,
      loadingGroups,
      profile,
      loadingProfile,
      refreshProfile,
      saveProfile,
      refreshGroups,
      saveGroup,
      getGroupById,
      rememberGroupId,
      getPreferredGroupId,
    }),
    [
      bootstrapping,
      groups,
      availableUsers,
      loadingGroups,
      profile,
      loadingProfile,
      refreshProfile,
      saveProfile,
      refreshGroups,
      saveGroup,
      getGroupById,
      rememberGroupId,
      getPreferredGroupId,
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
