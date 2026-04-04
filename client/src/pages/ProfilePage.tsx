import { useState } from "react";
import ProfileFormCard from "../components/ProfileFormCard";
import { useAppData } from "../context/AppDataContext";

export default function ProfilePage() {
  const { profile, loadingProfile, refreshProfile, saveProfile } = useAppData();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <ProfileFormCard
      initialProfile={profile}
      saving={saving}
      loading={loadingProfile}
      message={message}
      onSubmit={async (nextProfile) => {
        try {
          setSaving(true);
          setMessage(null);
          await saveProfile(nextProfile);
          setMessage("Profile saved");
        } catch (error) {
          setMessage(
            error instanceof Error ? error.message : "Failed to save profile",
          );
        } finally {
          setSaving(false);
        }
      }}
      onReload={async () => {
        setMessage(null);
        await refreshProfile();
      }}
    />
  );
}
