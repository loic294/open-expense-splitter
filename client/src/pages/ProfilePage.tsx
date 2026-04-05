import { useState } from "react";
import ProfileFormCard from "../components/ProfileFormCard";
import { useAppData } from "../context/AppDataContext";
import { memberName } from "../utils/spending";

export default function ProfilePage() {
  const {
    profile,
    loadingProfile,
    refreshProfile,
    saveProfile,
    contacts,
    platformInvites,
    createPlatformInvite,
    refreshContacts,
  } = useAppData();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
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

      <section className="card card-border bg-base-100 rounded-md w-full">
        <div className="card-body p-3 md:p-4 gap-3">
          <h2 className="card-title text-base">Invite users to the platform</h2>
          <p className="text-sm text-base-content/70">
            Create an invite link and share it manually. Accepted invites become
            known contacts.
          </p>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              className="input input-sm w-full"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="optional email lock (friend@example.com)"
            />
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={async () => {
                try {
                  setInviteMessage(null);
                  const invite = await createPlatformInvite(
                    inviteEmail || undefined,
                  );
                  await navigator.clipboard.writeText(invite.inviteUrl);
                  setInviteMessage("Invite created and copied to clipboard.");
                  setInviteEmail("");
                } catch (error) {
                  setInviteMessage(
                    error instanceof Error
                      ? error.message
                      : "Failed to create invite",
                  );
                }
              }}
            >
              Create invite link
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => refreshContacts()}
            >
              Refresh
            </button>
          </div>

          {inviteMessage && (
            <div className="alert alert-soft">
              <span>{inviteMessage}</span>
            </div>
          )}

          <div className="overflow-x-auto rounded-md border border-base-300">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Email lock</th>
                  <th>Status</th>
                  <th>Invite link</th>
                </tr>
              </thead>
              <tbody>
                {platformInvites.length > 0 ? (
                  platformInvites.slice(0, 10).map((invite) => (
                    <tr key={invite.id}>
                      <td>{invite.email || "Any authenticated user"}</td>
                      <td>{invite.status}</td>
                      <td>
                        <button
                          type="button"
                          className="link link-primary"
                          onClick={() =>
                            navigator.clipboard.writeText(invite.inviteUrl)
                          }
                        >
                          Copy link
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={3}
                      className="text-center text-sm text-base-content/70"
                    >
                      No invites yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card card-border bg-base-100 rounded-md w-full">
        <div className="card-body p-3 md:p-4 gap-3">
          <h2 className="card-title text-base">Known contacts</h2>
          <div className="flex flex-col gap-2">
            {contacts.length > 0 ? (
              contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="rounded-md border border-base-300 px-3 py-2 text-sm"
                >
                  {memberName(contact)}
                  {contact.email ? ` (${contact.email})` : ""}
                </div>
              ))
            ) : (
              <p className="text-sm text-base-content/70">
                No contacts yet. Accept or send an invite link first.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
