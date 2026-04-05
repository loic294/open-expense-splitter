import { useAuth0 } from "@auth0/auth0-react";

export default function LoginPage() {
  const { loginWithRedirect } = useAuth0();

  return (
    <main className="min-h-screen bg-base-200 px-4 py-8 md:px-6 md:py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="hero overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-sm">
          <div className="hero-content w-full max-w-none p-6 md:p-10">
            <div className="flex w-full flex-col items-start gap-8 text-left lg:flex-row lg:items-start lg:justify-start">
              <div className="max-w-2xl space-y-5">
                <div className="space-y-3">
                  <p className="badge badge-soft badge-primary badge-lg">
                    Open Expense Splitter
                  </p>
                  <h1 className="text-4xl font-semibold tracking-tight md:text-5xl pt-6">
                    Track shared spending without turning it into a spreadsheet
                    job.
                  </h1>
                  <p className="max-w-xl text-base leading-7 text-base-content/75 md:text-lg">
                    Create groups, record who paid, review balances, and keep
                    each trip, household, or event on its own dedicated page.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 text-sm pb-4">
                  <span className="badge badge-outline badge-primary">
                    Free to use
                  </span>
                  <span className="badge badge-outline">Open source</span>
                  <span className="badge badge-outline">Group invites</span>
                  <span className="badge badge-outline">
                    CSV import support
                  </span>
                  <span className="badge badge-outline">
                    Multiple currencies
                  </span>
                </div>

                <div className="card-actions items-center gap-3">
                  <button
                    type="button"
                    className="btn btn-primary btn-wide"
                    onClick={() => loginWithRedirect()}
                  >
                    Login with Auth0
                  </button>
                  <p className="text-sm text-base-content/65">
                    No subscription, no paywall, no upsell.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div
          role="alert"
          className="alert alert-error border border-error alert-soft shadow-sm"
        >
          <span className="text-lg leading-6">
            Open Expense Splitter is totally open sourced and free to use, but
            it does not encrypt your stored data.{" "}
            <b>
              Do not use it for sensitive financial information unless you
              accept that risk.
            </b>
          </span>
        </div>

        <section className="grid gap-4 lg:grid-cols-3">
          <article className="card card-border bg-base-100 shadow-sm">
            <div className="card-body gap-3">
              <p className="badge badge-soft badge-secondary w-fit">
                Focused workflow
              </p>
              <h2 className="card-title text-xl">
                Create groups for easy grouping
              </h2>
              <p className="text-sm leading-6 text-base-content/70">
                Create dedicated groups for trips, family expenses, shared
                apartments, and events so each context keeps its own clear
                transaction history.
              </p>
            </div>
          </article>

          <article className="card card-border bg-base-100 shadow-sm">
            <div className="card-body gap-3">
              <p className="badge badge-soft badge-accent w-fit">
                Shared visibility
              </p>
              <h2 className="card-title text-xl">
                Track who paid and who owes
              </h2>
              <p className="text-sm leading-6 text-base-content/70">
                Keep a running transaction history, review group summaries, and
                use the current balances to make reimbursements easier to
                settle.
              </p>
            </div>
          </article>

          <article className="card card-border bg-base-100 shadow-sm">
            <div className="card-body gap-3">
              <p className="badge badge-soft badge-primary w-fit">
                Practical setup
              </p>
              <h2 className="card-title text-xl">
                Invite people and import faster
              </h2>
              <p className="text-sm leading-6 text-base-content/70">
                Bring people into a group with invite links and speed up
                onboarding with CSV import support for existing transaction
                exports.
              </p>
            </div>
          </article>
        </section>

        <section className="card card-border bg-base-100 shadow-sm">
          <div className="card-body gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight">
                Use it because you <i>want to</i>, not because you{" "}
                <i>have to</i>.
              </h2>
              <p className="max-w-3xl text-sm leading-6 text-base-content/70">
                This project is free, openly available, and intended to be
                transparent.
              </p>
            </div>

            <div className="card-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => loginWithRedirect()}
              >
                Continue to sign in
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
