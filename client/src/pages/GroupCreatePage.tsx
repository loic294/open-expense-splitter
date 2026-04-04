import { useState } from "react";
import { useNavigate } from "react-router-dom";
import GroupFormCard from "../components/GroupFormCard";
import { useAppData } from "../context/AppDataContext";
import type { GroupForm } from "../types";

const initialForm: GroupForm = {
  name: "",
  emoji: "💸",
  memberIds: [],
};

export default function GroupCreatePage() {
  const { availableUsers, groups, saveGroup } = useAppData();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <GroupFormCard
      title="Create a new group"
      description={
        groups.length === 0
          ? "Before tracking expenses, create your first group and choose who belongs to it."
          : "Set the group name, emoji, and members."
      }
      initialForm={initialForm}
      availableUsers={availableUsers}
      submitLabel="Create group"
      saving={saving}
      message={message}
      onSubmit={async (form) => {
        try {
          setSaving(true);
          setMessage(null);
          const groupId = await saveGroup(form);
          navigate(groupId ? `/groups/${groupId}` : "/", { replace: true });
        } catch (error) {
          setMessage(
            error instanceof Error ? error.message : "Failed to save group",
          );
        } finally {
          setSaving(false);
        }
      }}
      onCancel={
        groups.length > 0
          ? () => {
              navigate(-1);
            }
          : undefined
      }
    />
  );
}
