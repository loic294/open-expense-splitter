import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApiCall } from "../api";
import { useAppData } from "../context/AppDataContext";

interface PlatformInviteDetails {
  inviter_name: string | null;
  inviter_email: string;
  email: string | null;
  status: string;
}

export default function PlatformInviteConfirmPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const apiCall = useApiCall();
  const { acceptPlatformInvite } = useAppData();
  const [invite, setInvite] = useState<PlatformInviteDetails | null>(null);
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
          `/api/platform-invites/${encodeURIComponent(token)}`,
        )) as PlatformInviteDetails;
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
        <h2 className="card-title text-base">Platform invitation</h2>

        {loading ? (
          <div className="flex justify-center py-4">
            <span className="loading loading-spinner loading-md" />
          </div>
        ) : (
          <>
            <p className="text-sm text-base-content/70">
              {invite
                ? `${invite.inviter_name || invite.inviter_email} invited you to connect on the platform.`
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
                    await acceptPlatformInvite(token);
                    setMessage("Invite accepted. Contact added.");
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
                onClick={() => navigate("/profile")}
              >
                Back to profile
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
