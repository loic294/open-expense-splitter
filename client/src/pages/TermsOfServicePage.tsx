import { Link } from "react-router-dom";
import Footer from "../components/Footer";

export default function TermsOfServicePage() {
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
                Terms of Service
              </h1>
              <p className="text-base-content/70 text-sm">
                Last updated: April 5, 2026
              </p>
            </div>

            <section className="card bg-base-100 shadow-sm">
              <div className="card-body">
                <h2 className="card-title text-xl">1. Acceptance of Terms</h2>
                <p>
                  By accessing and using Open Expense Splitter, you accept and
                  agree to be bound by the terms and provision of this
                  agreement. If you do not agree to abide by the above, please
                  do not use this service.
                </p>
              </div>
            </section>

            <section className="card bg-base-100 shadow-sm">
              <div className="card-body">
                <h2 className="card-title text-xl">2. Use License</h2>
                <p>
                  Permission is granted to temporarily download one copy of the
                  materials (information or software) on Open Expense Splitter
                  for personal, non-commercial transitory viewing only. This is
                  the grant of a license, not a transfer of title, and under
                  this license you may not:
                </p>
                <ul className="list list-row space-y-2 mt-3">
                  <li>Modify or copy the materials</li>
                  <li>Use the materials for any commercial purpose</li>
                  <li>
                    Attempt to decompile or reverse engineer any software
                    contained on the service
                  </li>
                  <li>Remove any copyright or other proprietary notations</li>
                  <li>
                    Transfer the materials to another person or "mirror" the
                    materials on any other server
                  </li>
                </ul>
              </div>
            </section>

            <section className="card bg-base-100 shadow-sm">
              <div className="card-body">
                <h2 className="card-title text-xl">3. Disclaimer</h2>
                <p>
                  The materials on Open Expense Splitter are provided on an 'as
                  is' basis. We make no warranties, expressed or implied, and
                  hereby disclaim and negate all other warranties including,
                  without limitation, implied warranties or conditions of
                  merchantability, fitness for a particular purpose, or
                  non-infringement of intellectual property or other violation
                  of rights.
                </p>
              </div>
            </section>

            <section className="card bg-base-100 shadow-sm">
              <div className="card-body">
                <h2 className="card-title text-xl">4. Limitations</h2>
                <p>
                  In no event shall Open Expense Splitter or its suppliers be
                  liable for any damages (including, without limitation, damages
                  for loss of data or profit, or due to business interruption)
                  arising out of the use or inability to use the materials on
                  Open Expense Splitter.
                </p>
              </div>
            </section>

            <section className="card bg-base-100 shadow-sm">
              <div className="card-body">
                <h2 className="card-title text-xl">5. Accuracy of Materials</h2>
                <p>
                  The materials appearing on Open Expense Splitter could include
                  technical, typographical, or photographic errors. We do not
                  warrant that any of the materials on our service are accurate,
                  complete, or current. We may make changes to the materials
                  contained on our service at any time without notice.
                </p>
              </div>
            </section>

            <section className="card bg-base-100 shadow-sm">
              <div className="card-body">
                <h2 className="card-title text-xl">6. Materials and Content</h2>
                <p>
                  The materials appearing on Open Expense Splitter may include
                  technical, typographical, or photographic errors. We do not
                  warrant that any information on our service is accurate,
                  complete, or current. We may make changes to the information
                  contained on our service at any time without notice.
                </p>
              </div>
            </section>

            <section className="card bg-base-100 shadow-sm">
              <div className="card-body">
                <h2 className="card-title text-xl">7. Links</h2>
                <p>
                  We have not reviewed all of the sites linked to our website
                  and are not responsible for the contents of any such linked
                  site. The inclusion of any link does not imply endorsement by
                  us of the site. Use of any such linked website is at the
                  user's own risk.
                </p>
              </div>
            </section>

            <section className="card bg-base-100 shadow-sm">
              <div className="card-body">
                <h2 className="card-title text-xl">8. Modifications</h2>
                <p>
                  We may revise these terms of service for our service at any
                  time without notice. By using this service, you are agreeing
                  to be bound by the then current version of these terms of
                  service.
                </p>
              </div>
            </section>

            <section className="card bg-base-100 shadow-sm">
              <div className="card-body">
                <h2 className="card-title text-xl">9. Governing Law</h2>
                <p>
                  These terms and conditions are governed by and construed in
                  accordance with the laws of the jurisdiction in which the
                  service operates, and you irrevocably submit to the exclusive
                  jurisdiction of the courts in that location.
                </p>
              </div>
            </section>

            <section className="card bg-base-100 shadow-sm">
              <div className="card-body">
                <h2 className="card-title text-xl">10. Contact Information</h2>
                <p>
                  If you have any questions about these Terms of Service, please{" "}
                  <a
                    href="https://loicbellemarealford.ca/about"
                    className="link link-hover"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    contact us
                  </a>
                  . We're here to help and happy to address any concerns you may
                  have.
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
