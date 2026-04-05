import { useEffect, useState, type FormEvent } from "react";
import type { GroupForm, GroupMember, TemporaryMemberInput } from "../types";
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
  const [inviteEmailInput, setInviteEmailInput] = useState("");
  const [temporaryNameInput, setTemporaryNameInput] = useState("");
  const [temporaryEmailInput, setTemporaryEmailInput] = useState("");

  useEffect(() => {
    setForm(initialForm);
  }, [initialForm]);

  const addInviteEmail = () => {
    const email = inviteEmailInput.trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return;
    }

    setForm((prev) => ({
      ...prev,
      inviteEmails: prev.inviteEmails.includes(email)
        ? prev.inviteEmails
        : [...prev.inviteEmails, email],
    }));
    setInviteEmailInput("");
  };

  const removeInviteEmail = (email: string) => {
    setForm((prev) => ({
      ...prev,
      inviteEmails: prev.inviteEmails.filter((value) => value !== email),
    }));
  };

  const addTemporaryMember = () => {
    const name = temporaryNameInput.trim();
    const email = temporaryEmailInput.trim().toLowerCase();
    if (!name) {
      return;
    }

    const item: TemporaryMemberInput = {
      name,
      email,
    };

    setForm((prev) => ({
      ...prev,
      temporaryMembers: [...prev.temporaryMembers, item],
    }));
    setTemporaryNameInput("");
    setTemporaryEmailInput("");
  };

  const removeTemporaryMember = (index: number) => {
    setForm((prev) => ({
      ...prev,
      temporaryMembers: prev.temporaryMembers.filter((_, idx) => idx !== index),
    }));
  };

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
            <legend className="fieldset-legend">Known contacts</legend>
            <div className="flex flex-col gap-2 rounded-md border border-base-300 p-3">
              {availableUsers.length > 0 ? (
                availableUsers.map((member) => (
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
                ))
              ) : (
                <p className="text-sm text-base-content/70">
                  No known contacts yet. Use the Profile page to generate invite
                  links and connect users first.
                </p>
              )}
            </div>
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset-legend">Invite by email</legend>
            <div className="rounded-md border border-base-300 p-3 flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  className="input input-sm w-full"
                  value={inviteEmailInput}
                  onChange={(event) => setInviteEmailInput(event.target.value)}
                  placeholder="friend@example.com"
                />
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={addInviteEmail}
                >
                  Add invite
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {form.inviteEmails.length > 0 ? (
                  form.inviteEmails.map((email) => (
                    <button
                      key={email}
                      type="button"
                      className="badge badge-soft badge-info gap-1"
                      onClick={() => removeInviteEmail(email)}
                    >
                      {email} x
                    </button>
                  ))
                ) : (
                  <span className="text-sm text-base-content/60">
                    Added emails will get unique share links after you save.
                  </span>
                )}
              </div>
            </div>
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset-legend">Temporary members</legend>
            <div className="rounded-md border border-base-300 p-3 flex flex-col gap-3">
              <div className="grid gap-2 md:grid-cols-[2fr_2fr_auto]">
                <input
                  className="input input-sm w-full"
                  value={temporaryNameInput}
                  onChange={(event) =>
                    setTemporaryNameInput(event.target.value)
                  }
                  placeholder="Display name"
                />
                <input
                  className="input input-sm w-full"
                  value={temporaryEmailInput}
                  onChange={(event) =>
                    setTemporaryEmailInput(event.target.value)
                  }
                  placeholder="optional-email@example.com"
                />
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={addTemporaryMember}
                >
                  Add
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {form.temporaryMembers.length > 0 ? (
                  form.temporaryMembers.map((member, index) => (
                    <div
                      key={`${member.id || "new"}-${member.name}-${index}`}
                      className="flex items-center justify-between rounded-md border border-base-300 px-2 py-1"
                    >
                      <span className="text-sm">
                        {member.name}
                        {member.email ? ` (${member.email})` : ""}
                      </span>
                      <button
                        type="button"
                        className="btn btn-xs"
                        onClick={() => removeTemporaryMember(index)}
                      >
                        Remove
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-base-content/60">
                    Add temporary members when someone has expenses but no
                    account yet.
                  </p>
                )}
              </div>
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
