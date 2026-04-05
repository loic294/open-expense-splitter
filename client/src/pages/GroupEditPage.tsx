import { useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import ColumnVisibilityCard from "../components/ColumnVisibilityCard";
import GroupFormCard from "../components/GroupFormCard";
import { useAppData } from "../context/AppDataContext";
import type { GroupForm, TransactionColumnType } from "../types";

export default function GroupEditPage() {
  const { groupId } = useParams();
  const { availableUsers, getGroupById, saveGroup, saveVisibleColumns } =
    useAppData();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [savingColumns, setSavingColumns] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const group = getGroupById(groupId);

  const initialForm = useMemo<GroupForm>(
    () => ({
      id: group?.id,
      name: group?.name || "",
      emoji: group?.emoji || "💸",
      memberIds: group?.members.map((member) => member.id) || [],
    }),
    [group],
  );

  if (!group) {
    return <Navigate to="/" replace />;
  }

  if (!group.canEdit) {
    return (
      <div className="alert alert-warning">
        <span>You do not have permission to edit this group.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <GroupFormCard
        title="Update group"
        description="Set the group name, emoji, and members."
        initialForm={initialForm}
        availableUsers={availableUsers}
        submitLabel="Update group"
        saving={saving}
        message={message}
        onSubmit={async (form) => {
          try {
            setSaving(true);
            setMessage(null);
            const nextGroupId = await saveGroup(form, group.id);
            navigate(
              nextGroupId ? `/groups/${nextGroupId}` : `/groups/${group.id}`,
              {
                replace: true,
              },
            );
          } catch (error) {
            setMessage(
              error instanceof Error ? error.message : "Failed to save group",
            );
          } finally {
            setSaving(false);
          }
        }}
        onCancel={() => navigate(`/groups/${group.id}`)}
      />

      <ColumnVisibilityCard
        title="Visible columns"
        description="Choose which columns to display in the transaction table."
        initialVisibleColumns={
          group.visibleColumns || [
            "name",
            "amount",
            "currency",
            "paid_by",
            "date",
            "category",
            "split",
            "description",
          ]
        }
        saving={savingColumns}
        onSave={async (columns: TransactionColumnType[]) => {
          try {
            setSavingColumns(true);
            await saveVisibleColumns(group.id, columns);
          } finally {
            setSavingColumns(false);
          }
        }}
      />
    </div>
  );
}
