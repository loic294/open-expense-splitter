import { useEffect, useState, type FormEvent } from "react";
import type { ProfileForm } from "../types";

interface ProfileFormCardProps {
  initialProfile: ProfileForm;
  saving: boolean;
  loading: boolean;
  message: string | null;
  onSubmit: (profile: ProfileForm) => Promise<void>;
  onReload: () => Promise<void>;
}

export default function ProfileFormCard({
  initialProfile,
  saving,
  loading,
  message,
  onSubmit,
  onReload,
}: ProfileFormCardProps) {
  const [form, setForm] = useState<ProfileForm>(initialProfile);

  useEffect(() => {
    setForm(initialProfile);
  }, [initialProfile]);

  const handleImageUpload = (file?: File) => {
    if (!file || !file.type.startsWith("image/")) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setForm((prev) => ({ ...prev, picture: result }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await onSubmit(form);
  };

  return (
    <section className="card card-border bg-base-100 rounded-md w-full">
      <div className="card-body p-3 md:p-4 gap-3">
        <h2 className="card-title text-base">Profile</h2>

        <div className="flex items-center gap-3">
          <div className="avatar">
            <div className="w-14 rounded-md bg-base-200">
              {form.picture ? (
                <img src={form.picture} alt="" aria-hidden="true" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-base-content/50 text-sm">
                  No image
                </div>
              )}
            </div>
          </div>
          <p className="text-sm text-base-content/70">
            Set your public profile details used inside the app.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <fieldset className="fieldset">
            <legend className="fieldset-legend">Name</legend>
            <input
              className="input input-sm w-full"
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="Your display name"
              maxLength={100}
            />
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset-legend">Email</legend>
            <input
              className="input input-sm w-full"
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, email: event.target.value }))
              }
              placeholder="you@example.com"
              required
            />
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset-legend">Profile picture URL</legend>
            <input
              className="input input-sm w-full"
              type="url"
              value={form.picture}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, picture: event.target.value }))
              }
              placeholder="https://example.com/photo.jpg"
            />
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset-legend">Upload image</legend>
            <input
              className="file-input file-input-sm w-full"
              type="file"
              accept="image/*"
              onChange={(event) => handleImageUpload(event.target.files?.[0])}
            />
          </fieldset>

          <div className="flex items-center gap-2">
            <button type="submit" className="btn btn-sm btn-primary">
              {saving ? "Saving..." : "Save profile"}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={onReload}
              disabled={loading}
            >
              {loading ? "Refreshing..." : "Reload"}
            </button>
          </div>
        </form>

        {message && (
          <div role="status" aria-live="polite" aria-atomic="true">
            {message && (
              <div className="alert alert-soft">
                <span>{message}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
