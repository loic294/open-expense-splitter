import { Link } from "react-router-dom";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer w-full gap-4 py-4">
      <nav className="flex flex-wrap justify-start gap-4 text-sm">
        <Link to="/terms" className="link link-hover">
          Terms of Service
        </Link>
        <Link to="/privacy" className="link link-hover">
          Privacy Policy
        </Link>
        <a
          href="https://loicbellemarealford.ca/about"
          className="link link-hover"
          target="_blank"
          rel="noopener noreferrer"
        >
          Contact
        </a>
      </nav>

      <div className="flex flex-row flex-end gap-2 text-xs">
        <p className="font-medium">© {currentYear} Loïc Bellemare-Alford</p>
        <p>
          Licensed under{" "}
          <a
            href="https://github.com/loicba/batch-spending-splitter/blob/main/LICENSE"
            className="link link-hover"
            target="_blank"
            rel="noopener noreferrer"
          >
            CC BY-NC 4.0
          </a>
        </p>
        <p>
          <a
            href="https://github.com/loicba/batch-spending-splitter"
            className="link link-hover"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </p>
      </div>
    </footer>
  );
}
