import { useAuth0 } from "@auth0/auth0-react";
import logo from "../assets/OpenExpenseSplitterLogo.svg";
import Footer from "../components/Footer";

export default function HomePage() {
  const { loginWithRedirect } = useAuth0();

  return (
    <div className="flex flex-col min-h-screen bg-base-200">
      <header className="navbar bg-base-100 border-b border-base-300 px-4 md:px-6 sticky top-0 z-10 shadow-sm">
        <div className="w-full">
          <div className="flex items-center gap-2 text-base md:text-lg font-semibold">
            <img
              src={logo}
              alt="Open Expense Splitter logo"
              className="h-8 w-8"
            />
            <span>Open Expense Splitter</span>
          </div>
        </div>
      </header>

      <main className="flex-1 pb-8 md:pb-10">
        <section className="relative overflow-hidden border-b border-warning/30 bg-gradient-to-br from-warning/35 via-warning/20 to-base-100 shadow-sm">
          <div className="pointer-events-none absolute -left-20 top-6 h-56 w-56 rounded-full bg-warning/30 blur-3xl" />
          <div className="pointer-events-none absolute -right-16 bottom-0 h-64 w-64 rounded-full bg-warning/20 blur-3xl" />

          <div className="hero mx-auto w-full max-w-6xl px-4 md:px-6">
            <div className="hero-content w-full max-w-none py-20 md:py-24">
              <div className="flex w-full flex-col items-start gap-8 text-left lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-2xl space-y-5">
                  <div className="space-y-3">
                    <p className="badge badge-soft badge-primary badge-lg">
                      Open Expense Splitter
                    </p>
                    <h1 className="pt-2 text-4xl font-semibold tracking-tight md:text-5xl">
                      Track shared spending without turning it into a
                      spreadsheet job.
                    </h1>
                    <p className="max-w-xl text-base leading-7 text-base-content/75 md:text-lg">
                      Create groups, record who paid, review balances, and keep
                      each trip, household, or event on its own dedicated page.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 pb-2 text-sm">
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

                <div className="grid w-full max-w-sm grid-cols-2 gap-3">
                  <div className="rounded-box border border-warning/40 bg-base-100/80 p-4 backdrop-blur">
                    <p className="text-xs uppercase tracking-wide text-base-content/60">
                      Pricing
                    </p>
                    <p className="text-xl font-semibold">$0 forever</p>
                  </div>
                  <div className="rounded-box border border-warning/40 bg-base-100/80 p-4 backdrop-blur">
                    <p className="text-xs uppercase tracking-wide text-base-content/60">
                      Paywall
                    </p>
                    <p className="text-xl font-semibold">None</p>
                  </div>
                  <div className="col-span-2 rounded-box border border-warning/40 bg-base-100/80 p-4 backdrop-blur">
                    <p className="text-xs uppercase tracking-wide text-base-content/60">
                      Built for
                    </p>
                    <p className="text-base font-medium">
                      Trips, roommates, events, and shared households
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto mt-6 flex max-w-6xl flex-col gap-10 px-4 md:mt-10 md:px-6">
          <div
            role="alert"
            className="alert alert-error border border-error alert-soft shadow-sm"
          >
            <span className="text-base leading-6">
              The current hosted Cloudflare version uses encryption in transit
              (TLS) and Cloudflare D1 encryption at rest. Security has not been
              externally audited, so avoid sensitive financial data. Self-hosted
              deployments do not encrypt data at rest by default. See{" "}
              <a
                href="https://developers.cloudflare.com/d1/reference/data-security/"
                target="_blank"
                rel="noopener noreferrer"
                className="link"
              >
                Cloudflare D1 data security documentation
              </a>
              .
            </span>
          </div>

          <section className="grid gap-4 lg:grid-cols-3">
            <article className="card card-border bg-base-100 shadow-sm">
              <div className="card-body gap-3">
                <p className="badge badge-soft badge-secondary w-fit">
                  Focused workflow
                </p>
                <h2 className="card-title text-xl">Create unlimited groups</h2>
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
                  Keep a running transaction history, review group summaries,
                  and use the current balances to make reimbursements easier to
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
            <div className="card-body gap-4">
              <div className="space-y-1">
                <p className="badge badge-soft badge-success w-fit">
                  Everything included, always free
                </p>
                <h2 className="text-2xl font-semibold tracking-tight pt-1">
                  How we compare
                </h2>
                <p className="text-sm leading-6 text-base-content/70">
                  No tiers, no upsells. Every feature is available to every
                  user.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="table table-zebra w-full text-sm">
                  <thead>
                    <tr>
                      <caption className="sr-only">
                        Feature comparison between Open Expense Splitter and
                        competitors
                      </caption>
                      <th
                        scope="col"
                        className="text-base-content/60 font-medium"
                      >
                        Feature
                      </th>
                      <th scope="col" className="text-center">
                        <span className="text-success font-semibold">
                          Open Expense Splitter
                        </span>
                      </th>
                      <th
                        scope="col"
                        className="text-center text-base-content/60 font-medium"
                      >
                        Splitwise
                      </th>
                      <th
                        scope="col"
                        className="text-center text-base-content/60 font-medium"
                      >
                        SettleUp
                      </th>
                      <th
                        scope="col"
                        className="text-center text-base-content/60 font-medium"
                      >
                        Tricount
                      </th>
                      <th
                        scope="col"
                        className="text-center text-base-content/60 font-medium"
                      >
                        SplitMyExpenses
                      </th>
                      <th
                        scope="col"
                        className="text-center text-base-content/60 font-medium"
                      >
                        Splid
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        feature: "Unlimited groups",
                        ours: true,
                        splitwise: "Limited on free",
                        settleup: "Limited on free",
                        tricount: true,
                        splitmyexpenses: true,
                        splid: "Limited on free",
                      },
                      {
                        feature: "Expense tracking & balances",
                        ours: true,
                        splitwise: true,
                        settleup: true,
                        tricount: true,
                        splitmyexpenses: true,
                        splid: true,
                      },
                      {
                        feature: "Group invite links",
                        ours: true,
                        splitwise: true,
                        settleup: true,
                        tricount: true,
                        splitmyexpenses: false,
                        splid: true,
                      },
                      {
                        feature: "Multiple currencies",
                        ours: true,
                        splitwise: "Pro only",
                        settleup: "Pro only",
                        tricount: true,
                        splitmyexpenses: true,
                        splid: "Pro only",
                      },
                      {
                        feature: "CSV import",
                        ours: true,
                        splitwise: "Pro only",
                        settleup: false,
                        tricount: false,
                        splitmyexpenses: false,
                        splid: false,
                      },
                      {
                        feature: "No ads",
                        ours: true,
                        splitwise: "Pro only",
                        settleup: "Pro only",
                        tricount: "Pro only",
                        splitmyexpenses: true,
                        splid: "Pro only",
                      },
                      {
                        feature: "Open source",
                        ours: true,
                        splitwise: false,
                        settleup: false,
                        tricount: false,
                        splitmyexpenses: false,
                        splid: false,
                      },
                      {
                        feature: "No subscription required",
                        ours: true,
                        splitwise: false,
                        settleup: false,
                        tricount: false,
                        splitmyexpenses: false,
                        splid: false,
                      },
                      {
                        feature: "Mobile apps",
                        ours: "PWA",
                        splitwise: true,
                        settleup: true,
                        tricount: true,
                        splitmyexpenses: false,
                        splid: true,
                      },
                      {
                        feature: "Receipt upload",
                        ours: "Coming soon!",
                        splitwise: "Pro only",
                        settleup: "Pro only",
                        tricount: false,
                        splitmyexpenses: false,
                        splid: "Pro only",
                      },
                      {
                        feature: "Receipt parsing",
                        ours: "Coming soon!",
                        splitwise: "Pro only",
                        settleup: false,
                        tricount: false,
                        splitmyexpenses: false,
                        splid: false,
                      },
                    ].map(
                      ({
                        feature,
                        ours,
                        splitwise,
                        settleup,
                        tricount,
                        splitmyexpenses,
                        splid,
                      }) => (
                        <tr key={feature}>
                          <td className="font-medium">{feature}</td>
                          {[
                            ours,
                            splitwise,
                            settleup,
                            tricount,
                            splitmyexpenses,
                            splid,
                          ].map((val, i) => (
                            <td key={i} className="text-center">
                              {val === true ? (
                                <span
                                  className="text-success font-bold text-base"
                                  aria-label="Yes"
                                >
                                  <span aria-hidden="true">✓</span>
                                </span>
                              ) : val === false ? (
                                <span
                                  className="text-error font-bold text-base"
                                  aria-label="No"
                                >
                                  <span aria-hidden="true">✗</span>
                                </span>
                              ) : (
                                <span
                                  className={`badge badge-soft badge-sm ${val === "PWA" ? "badge-success" : i === 0 ? "badge-info" : "badge-warning"}`}
                                >
                                  {val === "PWA" ? `✓ ${val}` : val}
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-base-content/50">
                Splitwise, SettleUp, Tricount, SplitMyExpenses, and Splid are
                trademarks of their respective owners. We do not own or claim
                any rights to these trademarks.
              </p>
            </div>
          </section>

          <section className="card card-border bg-base-100 shadow-sm">
            <div className="card-body gap-4">
              <div className="space-y-1">
                <p className="badge badge-soft badge-secondary w-fit">FAQ</p>
                <h2 className="text-2xl font-semibold tracking-tight pt-1">
                  Frequently asked questions
                </h2>
                <p className="text-sm leading-6 text-base-content/70">
                  Quick answers about pricing, privacy, and where the project is
                  heading.
                </p>
              </div>

              <div className="space-y-2">
                <div className="collapse collapse-arrow border border-base-300 bg-base-100">
                  <input
                    type="radio"
                    id="faq-1"
                    name="login-faq"
                    defaultChecked
                  />
                  <label
                    htmlFor="faq-1"
                    className="collapse-title text-base font-medium"
                  >
                    Is Open Expense Splitter free forever?
                  </label>
                  <div className="collapse-content text-sm leading-6 text-base-content/75">
                    Yes. The core product is free to use with no subscription
                    requirement and no paywall for existing features.
                  </div>
                </div>

                <div className="collapse collapse-arrow border border-base-300 bg-base-100">
                  <input type="radio" id="faq-2" name="login-faq" />
                  <label
                    htmlFor="faq-2"
                    className="collapse-title text-base font-medium"
                  >
                    Do you sell or share my expense data?
                  </label>
                  <div className="collapse-content text-sm leading-6 text-base-content/75">
                    No. Your data is not sold. The app stores what is needed to
                    run your groups, and you can remove your data from your
                    account at any time.
                  </div>
                </div>

                <div className="collapse collapse-arrow border border-base-300 bg-base-100">
                  <input type="radio" id="faq-3" name="login-faq" />
                  <label
                    htmlFor="faq-3"
                    className="collapse-title text-base font-medium"
                  >
                    What is a PWA and can I install it on my phone?
                  </label>
                  <div className="collapse-content text-sm leading-6 text-base-content/75">
                    A PWA (Progressive Web App) is a website that behaves like
                    an app when installed. On iPhone/iPad, open the site in
                    Safari, tap Share, then Add to Home Screen. On Android, open
                    the site in Chrome and tap Install app or Add to Home screen
                    from the browser menu.
                  </div>
                </div>

                <div className="collapse collapse-arrow border border-base-300 bg-base-100">
                  <input type="radio" id="faq-4" name="login-faq" />
                  <label
                    htmlFor="faq-4"
                    className="collapse-title text-base font-medium"
                  >
                    Is data encrypted?
                  </label>
                  <div className="collapse-content text-sm leading-6 text-base-content/75">
                    On the current Cloudflare-hosted version, data is encrypted
                    in transit (TLS) and encrypted at rest by Cloudflare D1.
                    Self-hosted deployments do not encrypt data at rest by
                    default. Security has not been externally audited, so avoid
                    storing sensitive financial data. See{" "}
                    <a
                      href="https://developers.cloudflare.com/d1/reference/data-security/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link"
                    >
                      Cloudflare D1 data security docs
                    </a>
                    .
                  </div>
                </div>

                <div className="collapse collapse-arrow border border-base-300 bg-base-100">
                  <input type="radio" id="faq-5" name="login-faq" />
                  <label
                    htmlFor="faq-5"
                    className="collapse-title text-base font-medium"
                  >
                    What does Cloudflare Web Analytics collect?
                  </label>
                  <div className="collapse-content text-sm leading-6 text-base-content/75">
                    The public Cloudflare-hosted version uses{" "}
                    <a
                      href="https://developers.cloudflare.com/web-analytics/about/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link"
                    >
                      Cloudflare Web Analytics
                    </a>
                    , a privacy-first analytics tool. It collects only page-load
                    performance metrics — page views, load times, Core Web
                    Vitals, referrer, browser and OS type, and country — using
                    the browser's built-in Performance API. It does not use
                    cookies, fingerprint users, or collect any personal data.
                    Cloudflare does not track individual visitors across sites.
                  </div>
                </div>

                <div className="collapse collapse-arrow border border-base-300 bg-base-100">
                  <input type="radio" id="faq-6" name="login-faq" />
                  <label
                    htmlFor="faq-6"
                    className="collapse-title text-base font-medium"
                  >
                    What features are coming next?
                  </label>
                  <div className="collapse-content text-sm leading-6 text-base-content/75">
                    Receipt upload and receipt parsing are planned next, along
                    with a proper native mobile app. The goal is to keep new
                    features open and available without paid tiers.
                  </div>
                </div>
              </div>
            </div>
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
          <Footer />
        </div>
      </main>
    </div>
  );
}
