import { useAuth0 } from "@auth0/auth0-react";

export default function LoginPage() {
  const { loginWithRedirect } = useAuth0();

  return (
    <main className="min-h-screen bg-base-200 px-4 py-10">
      <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center justify-center">
        <section className="card card-border w-full max-w-xl bg-base-100 shadow-sm">
          <div className="card-body gap-4 p-6 md:p-8">
            <div className="space-y-2">
              <p className="badge badge-soft badge-primary">
                Batch Spending Splitter
              </p>
              <h1 className="text-3xl font-semibold tracking-tight">
                Split group spending with dedicated pages instead of one giant
                app screen.
              </h1>
              <p className="text-sm text-base-content/70">
                Sign in to manage groups, profile details, and transactions
                through focused routes and components.
              </p>
            </div>

            <div className="card card-border bg-base-200/60">
              <div className="card-body gap-2 p-4 text-sm text-base-content/70">
                <p>
                  Group creation, editing, profile management, and dashboards
                  each have their own route.
                </p>
                <p>
                  Top-level app wiring stays in App.tsx while page logic lives
                  below it.
                </p>
              </div>
            </div>

            <div className="card-actions justify-end">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => loginWithRedirect()}
              >
                Login with Auth0
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
