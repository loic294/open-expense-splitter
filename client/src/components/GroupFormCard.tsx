import { useEffect, useState, type FormEvent } from "react";
import type { GroupForm, GroupMember } from "../types";
import { memberName } from "../utils/spending";

interface GroupFormCardProps {
  title: string;
  description: string;
  initialForm: GroupForm;
  availableUsers: GroupMember[];
  submitLabel: string;
  saving: boolean;
  message: string | null;
  onSubmit: (form: GroupForm) => Promise<void>;
  onCancel?: () => void;
}

export default function GroupFormCard({
  title,
  description,
  initialForm,
  availableUsers,
  submitLabel,
  saving,
  message,
  onSubmit,
  onCancel,
}: GroupFormCardProps) {
  const [form, setForm] = useState<GroupForm>(initialForm);

  useEffect(() => {
    setForm(initialForm);
  }, [initialForm]);

  const handleToggleMember = (memberId: string) => {
    setForm((prev) => ({
      ...prev,
      memberIds: prev.memberIds.includes(memberId)
        ? prev.memberIds.filter((id) => id !== memberId)
        : [...prev.memberIds, memberId],
    }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await onSubmit(form);
  };

  return (
    <section className="card card-border bg-base-100 rounded-md w-full">
      <div className="card-body p-3 md:p-4 gap-3">
        <h2 className="card-title text-base">{title}</h2>
        <p className="text-sm text-base-content/70">{description}</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <fieldset className="fieldset">
            <legend className="fieldset-legend">Group name</legend>
            <input
              className="input input-sm w-full"
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="Weekend trip"
              required
            />
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset-legend">Emoji</legend>
            <input
              className="input input-sm w-full"
              value={form.emoji}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, emoji: event.target.value }))
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
                    checked={form.memberIds.includes(member.id)}
                    onChange={() => handleToggleMember(member.id)}
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
              {saving ? "Saving..." : submitLabel}
            </button>
            {onCancel && (
              <button type="button" className="btn btn-sm" onClick={onCancel}>
                Cancel
              </button>
            )}
          </div>
        </form>

        {message && (
          <div className="alert alert-soft">
            <span>{message}</span>
          </div>
        )}
      </div>
    </section>
  );
}
