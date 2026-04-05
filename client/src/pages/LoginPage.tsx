import { useAuth0 } from "@auth0/auth0-react";
import logo from "../assets/OpenExpenseSplitterLogo.svg";
import Footer from "../components/Footer";

export default function LoginPage() {
  const { loginWithRedirect } = useAuth0();

  return (
    <div className="flex min-h-screen flex-col bg-base-200">
      <main className="flex flex-1 items-center justify-center px-4 py-10 md:px-6">
        <div className="w-full max-w-md">
          <section className="card card-border bg-base-100 shadow-sm">
            <div className="card-body items-center gap-5 text-center">
              <img
                src={logo}
                alt="Open Expense Splitter logo"
                className="h-14 w-14"
              />
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight">
                  Open Expense Splitter
                </h1>
                <p className="text-sm leading-6 text-base-content/75">
                  Split shared expenses across trips, events, and households in
                  one place.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-wide"
                onClick={() => loginWithRedirect()}
              >
                Login with Auth0
              </button>
            </div>
          </section>
          <div className="mt-4">
            <Footer center />
          </div>
        </div>
      </main>
    </div>
  );
}
