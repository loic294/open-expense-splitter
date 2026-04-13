import { useMemo, useState, useEffect } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useApiCall } from "../api";
import ColumnVisibilityCard from "../components/ColumnVisibilityCard";
import CategoryTagEmojiCard from "../components/CategoryTagEmojiCard";
import GroupFormCard from "../components/GroupFormCard";
import { useAppData } from "../context/AppDataContext";
import type { ContactInvite, GroupForm, TransactionColumnType } from "../types";
import { memberName } from "../utils/spending";

export default function GroupEditPage() {
  const { groupId } = useParams();
  const {
    availableUsers,
    getGroupById,
    refreshGroups,
    saveGroup,
    saveVisibleColumns,
  } = useAppData();
  const apiCall = useApiCall();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [savingColumns, setSavingColumns] = useState(false);
  const [replacingTemporaryMemberId, setReplacingTemporaryMemberId] = useState<
    string | null
  >(null);
  const [replacementTargets, setReplacementTargets] = useState<
    Record<string, string>
  >({});
  const [message, setMessage] = useState<string | null>(null);
  const [generatedInvites, setGeneratedInvites] = useState<ContactInvite[]>([]);
  const group = getGroupById(groupId);

  const [categories, setCategories] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);

  const temporaryMembers = useMemo(
    () => group?.members.filter((member) => !!member.is_temporary) || [],
    [group],
  );

  useEffect(() => {
    const fetchCategoriesAndTags = async () => {
      if (!group?.id) return;
      try {
        const data = (await apiCall(`/api/spendings?batchId=${group.id}`)) as {
          categories?: string[];
          tags?: string[];
        };
        setCategories(data.categories || []);
        setTags(data.tags || []);
      } catch (error) {
        console.error("Failed to fetch categories and tags", error);
      }
    };

    fetchCategoriesAndTags();
  }, [group?.id, apiCall]);

  const initialForm = useMemo<GroupForm>(
    () => ({
      id: group?.id,
      name: group?.name || "",
      emoji: group?.emoji || "💸",
      memberIds:
        group?.members
          .filter((member) => !member.is_temporary)
          .map((member) => member.id) || [],
      inviteEmails: [],
      temporaryMembers:
        group?.members
          .filter((member) => !!member.is_temporary)
          .map((member) => ({
            id: member.id,
            name: member.name || "",
            email: member.temporary_email || member.email || "",
          })) || [],
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
      <h1 className="sr-only">Group settings: {group.name}</h1>
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
            setGeneratedInvites([]);
            const result = await saveGroup(form, group.id);
            if (result.generatedInvites.length > 0) {
              setGeneratedInvites(result.generatedInvites);
              setMessage(
                `${result.generatedInvites.length} invite link(s) generated. Share them manually.`,
              );
            } else {
              setMessage("Group updated");
            }
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

      {generatedInvites.length > 0 && (
        <section
          aria-labelledby="generated-invites-heading"
          className="card card-border bg-base-100 rounded-md w-full"
        >
          <div className="card-body p-3 md:p-4 gap-3">
            <h2 id="generated-invites-heading" className="card-title text-base">
              Generated invite links
            </h2>
            <div className="flex flex-col gap-2">
              {generatedInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex flex-col md:flex-row md:items-center justify-between gap-2 rounded-md border border-base-300 px-3 py-2"
                >
                  <span className="text-sm">
                    {invite.email || "No email lock"}
                  </span>
                  <button
                    type="button"
                    className="btn btn-xs"
                    aria-label={`Copy invite link${invite.email ? ` for ${invite.email}` : " (no email lock)"}`}
                    onClick={() =>
                      navigator.clipboard.writeText(invite.inviteUrl)
                    }
                  >
                    Copy link
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {temporaryMembers.length > 0 && (
        <section
          aria-labelledby="temp-members-heading"
          className="card card-border bg-base-100 rounded-md w-full"
        >
          <div className="card-body p-3 md:p-4 gap-3">
            <h2 id="temp-members-heading" className="card-title text-base">
              Replace temporary members
            </h2>
            <p className="text-sm text-base-content/70">
              When a real contact joins, replace the temporary member to carry
              over past expenses.
            </p>
            <div className="flex flex-col gap-2">
              {temporaryMembers.map((member) => (
                <div
                  key={member.id}
                  className="rounded-md border border-base-300 px-3 py-2 flex flex-col md:flex-row gap-2 md:items-center md:justify-between"
                >
                  <span className="text-sm">
                    {memberName(member)}
                    {member.temporary_email
                      ? ` (${member.temporary_email})`
                      : ""}
                  </span>
                  <div className="flex gap-2 w-full md:w-auto">
                    <select
                      className="select select-sm w-full md:w-64"
                      value={replacementTargets[member.id] || ""}
                      aria-label={`Replacement contact for ${memberName(member)}`}
                      onChange={(event) =>
                        setReplacementTargets((prev) => ({
                          ...prev,
                          [member.id]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Select contact...</option>
                      {availableUsers.map((contact) => (
                        <option key={contact.id} value={contact.id}>
                          {memberName(contact)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      disabled={
                        !replacementTargets[member.id] ||
                        replacingTemporaryMemberId === member.id
                      }
                      onClick={async () => {
                        const replacementUserId = replacementTargets[member.id];
                        if (!replacementUserId) return;
                        try {
                          setReplacingTemporaryMemberId(member.id);
                          await apiCall(
                            `/api/groups/${group.id}/temporary-members/${member.id}/replace`,
                            {
                              method: "POST",
                              body: JSON.stringify({
                                userId: replacementUserId,
                              }),
                            },
                          );
                          await refreshGroups();
                          setMessage("Temporary member replaced successfully.");
                          setReplacementTargets((prev) => ({
                            ...prev,
                            [member.id]: "",
                          }));
                        } catch (error) {
                          setMessage(
                            error instanceof Error
                              ? error.message
                              : "Failed to replace temporary member",
                          );
                        } finally {
                          setReplacingTemporaryMemberId(null);
                        }
                      }}
                    >
                      {replacingTemporaryMemberId === member.id
                        ? "Replacing..."
                        : "Replace"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <CategoryTagEmojiCard
        groupId={group.id}
        categories={categories}
        tags={tags}
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
