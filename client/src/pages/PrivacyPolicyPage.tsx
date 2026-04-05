import { Link } from "react-router-dom";
import Footer from "../components/Footer";

export default function PrivacyPolicyPage() {
  return (
    <div className="flex flex-col min-h-screen bg-base-200">
      <main className="flex-1 px-4 py-8 md:px-6 md:py-12">
        <div className="mx-auto max-w-3xl">
          {/* Header */}
          <div className="mb-8 flex items-center gap-3">
            <Link to="/" className="link link-hover text-base-content/70">
              ← Back
            </Link>
          </div>

          <article className="prose prose-sm md:prose-base max-w-none space-y-6">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-base-content mb-2">
                Privacy Policy
              </h1>
              <p className="text-base-content/70 text-sm">
                Last updated: April 5, 2026
              </p>
            </div>

            <section className="card bg-base-100 shadow-sm">
              <div className="card-body">
                <h2 className="card-title text-xl">1. Introduction</h2>
                <p>
                  At Open Expense Splitter, we take your privacy seriously. This
                  Privacy Policy explains how we collect, use, disclose, and
                  safeguard your information when you visit our website and use
                  our service.
                </p>
              </div>
            </section>

            <section className="card bg-base-100 shadow-sm">
              <div className="card-body">
                <h2 className="card-title text-xl">
                  2. Information We Collect
                </h2>
                <p>We collect information in the following ways:</p>
                <ul className="list list-row space-y-2 mt-3">
                  <li>
                    <strong>Account Information:</strong> Email address and
                    profile information via Auth0
                  </li>
                  <li>
                    <strong>Service Data:</strong> Groups, spending records,
                    members, and transaction history
                  </li>
                  <li>
                    <strong>Usage Data:</strong> How you interact with our
                    service
                  </li>
                  <li>
                    <strong>Device Information:</strong> Browser type, IP
                    address, and pages visited
                  </li>
                </ul>
              </div>
            </section>

            <section className="card bg-base-100 shadow-sm">
              <div className="card-body">
                <h2 className="card-title text-xl">
                  3. How We Use Your Information
                </h2>
                <p>We use the information we collect to:</p>
                <ul className="list list-row space-y-2 mt-3">
                  <li>Provide, maintain, and improve our service</li>
                  <li>Process and complete transactions</li>
                  <li>Send you service-related announcements</li>
                  <li>Respond to your inquiries and support requests</li>
                  <li>Analyze usage patterns to enhance user experience</li>
                  <li>Comply with legal obligations</li>
                </ul>
              </div>
            </section>

            <section className="card bg-base-100 shadow-sm">
              <div className="card-body">
                <h2 className="card-title text-xl">4. Data Security</h2>
                <p>
                  We implement appropriate technical and organizational measures
                  to protect your personal information against unauthorized
                  access, alteration, disclosure, or destruction. Your data is
                  encrypted in transit (HTTPS).
                </p>
                <p className="mt-3">
                  <strong>⚠️ Important:</strong> Data stored in our database is
                  NOT encrypted at rest. This is an open source project intended
                  for personal use. Do not use Open Expense Splitter for
                  sensitive or highly confidential financial information unless
                  you fully accept the security risks involved.
                </p>
                <p className="mt-3">
                  While we strive to maintain reasonable security practices, no
                  method of electronic storage is 100% secure. We cannot
                  guarantee absolute security of your data.
                </p>
              </div>
            </section>

            <section className="card bg-base-100 shadow-sm">
              <div className="card-body">
                <h2 className="card-title text-xl">
                  5. Sharing Your Information
                </h2>
                <p>
                  We do not sell, trade, or rent your personal information to
                  third parties. We may share your information only in the
                  following circumstances:
                </p>
                <ul className="list list-row space-y-2 mt-3">
                  <li>
                    <strong>Group Members:</strong> Basic information is shared
                    with members of groups you create
                  </li>
                  <li>
                    <strong>Service Providers:</strong> We use Auth0 for
                    authentication
                  </li>
                  <li>
                    <strong>Legal Requirements:</strong> When required by law or
                    court order
                  </li>
                </ul>
              </div>
            </section>

            <section className="card bg-base-100 shadow-sm">
              <div className="card-body">
                <h2 className="card-title text-xl">6. Your Rights</h2>
                <p>You have the right to:</p>
                <ul className="list list-row space-y-2 mt-3">
                  <li>Access your personal information</li>
                  <li>Correct inaccurate data</li>
                  <li>Request deletion of your data</li>
                  <li>
                    Opt-out of certain communications (while maintaining service
                    functionality)
                  </li>
                  <li>Data portability where applicable</li>
                </ul>
              </div>
            </section>

            <section className="card bg-base-100 shadow-sm">
              <div className="card-body">
                <h2 className="card-title text-xl">7. Cookies and Tracking</h2>
                <p>
                  We use cookies and similar technologies to enhance your
                  experience. Cookies help us remember your preferences and
                  improve our service. You can control cookie settings through
                  your browser preferences.
                </p>
              </div>
            </section>

            <section className="card bg-base-100 shadow-sm">
              <div className="card-body">
                <h2 className="card-title text-xl">8. Third-Party Services</h2>
                <p>
                  Open Expense Splitter uses the following third-party services:
                </p>
                <ul className="list list-row space-y-2 mt-3">
                  <li>
                    <strong>Auth0:</strong> For user authentication and
                    authorization
                  </li>
                  <li>
                    <strong>Cloudflare:</strong> The public version of Open
                    Expense Splitter is hosted on Cloudflare Pages and
                    Cloudflare Workers. Cloudflare may collect usage and
                    telemetry data such as request patterns, error logs, and
                    performance metrics. Refer to{" "}
                    <a
                      href="https://www.cloudflare.com/privacypolicy/"
                      className="link link-hover"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Cloudflare's Privacy Policy
                    </a>{" "}
                    for details on their data collection practices.
                  </li>
                </ul>
                <p className="mt-3">
                  These services have their own privacy policies governing the
                  use of your information. We recommend reviewing their policies
                  to understand how they handle data.
                </p>
              </div>
            </section>

            <section className="card bg-base-100 shadow-sm">
              <div className="card-body">
                <h2 className="card-title text-xl">9. Data Retention</h2>
                <p>
                  We retain your personal information for as long as necessary
                  to provide our services and comply with legal obligations. You
                  can request deletion of your account and associated data at
                  any time.
                </p>
              </div>
            </section>

            <section className="card bg-base-100 shadow-sm">
              <div className="card-body">
                <h2 className="card-title text-xl">10. Children's Privacy</h2>
                <p>
                  Our service is not intended for children under 13 years old.
                  We do not knowingly collect information from children under
                  13. If we learn that we have collected personal information
                  from a child under 13, we will delete such information
                  promptly.
                </p>
              </div>
            </section>

            <section className="card bg-base-100 shadow-sm">
              <div className="card-body">
                <h2 className="card-title text-xl">11. Policy Changes</h2>
                <p>
                  We may update this Privacy Policy from time to time. We will
                  notify you of any changes by updating the "Last updated" date
                  at the top of this page. Your continued use of the service
                  constitutes your acceptance of changes to this Privacy Policy.
                </p>
              </div>
            </section>

            <section className="card bg-base-100 shadow-sm">
              <div className="card-body">
                <h2 className="card-title text-xl">12. Contact Us</h2>
                <p>
                  If you have questions or concerns about this Privacy Policy or
                  our privacy practices, please{" "}
                  <a
                    href="https://loicbellemarealford.ca/about"
                    className="link link-hover"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    contact us
                  </a>
                  . We will respond to your inquiry within a reasonable
                  timeframe.
                </p>
              </div>
            </section>
          </article>
          <Footer />
        </div>
      </main>
    </div>
  );
}
