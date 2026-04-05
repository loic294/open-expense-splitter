import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApiCall } from "../api";
import { useAppData } from "../context/AppDataContext";

interface GroupInviteDetails {
  group_id: string;
  group_name: string;
  group_emoji: string;
  inviter_name: string | null;
  inviter_email: string;
  email: string;
  status: string;
}

export default function GroupInviteConfirmPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const apiCall = useApiCall();
  const { acceptGroupInvite } = useAppData();
  const [invite, setInvite] = useState<GroupInviteDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setMessage("Invalid invite token.");
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        const details = (await apiCall(
          `/api/group-invites/${encodeURIComponent(token)}`,
        )) as GroupInviteDetails;
        setInvite(details);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Invite not found");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token, apiCall]);

  return (
    <section className="card card-border bg-base-100 rounded-md w-full max-w-2xl mx-auto">
      <div className="card-body p-4 gap-3">
        <h2 className="card-title text-base">Group invitation</h2>

        {loading ? (
          <div className="flex justify-center py-4">
            <span className="loading loading-spinner loading-md" />
          </div>
        ) : (
          <>
            <p className="text-sm text-base-content/70">
              {invite
                ? `${invite.inviter_name || invite.inviter_email} invited you to join ${invite.group_emoji} ${invite.group_name}.`
                : "This invite could not be loaded."}
            </p>
            {invite?.email && (
              <p className="text-sm text-base-content/70">
                This invite is locked to: {invite.email}
              </p>
            )}
            {message && (
              <div className="alert alert-soft">
                <span>{message}</span>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={!invite || submitting || invite.status !== "pending"}
                onClick={async () => {
                  if (!token) return;
                  try {
                    setSubmitting(true);
                    setMessage(null);
                    const result = await acceptGroupInvite(token);
                    setMessage("Invite accepted. You are now in the group.");
                    navigate(`/groups/${result.groupId}`, { replace: true });
                  } catch (error) {
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : "Failed to accept invite",
                    );
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                {submitting ? "Accepting..." : "Accept invite"}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => navigate("/")}
              >
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
