import { Link } from "vocs";

import { recoveryLinks } from "../lib/not-found";

/**
 * Overrides Vocs' built-in 404 to add the recovery list — the HTML half of what
 * `src/middleware/not-found.ts` serves as Markdown.
 *
 * The frame (classes, `data-v-not-found*` hooks, copy, icons) is Vocs' own, so the page keeps
 * looking like the rest of the site. The icons are inlined rather than imported from `~icons/*`:
 * that alias is Vocs' internal unplugin-icons virtual module and carries no types here.
 *
 * Being a `.tsx` page rather than `.mdx` keeps it out of `llms.txt` and the Markdown twins, where
 * a "page not found" entry would be noise; `sitemap.include` in `vocs.config.ts` drops it from the
 * sitemap for the same reason.
 */
const NotFound = () => (
  <div
    className="vocs:flex vocs:flex-col vocs:items-center vocs:justify-center vocs:min-h-[60vh] vocs:px-6 vocs:py-16 vocs:text-center"
    data-v-not-found
  >
    <div
      className="vocs:flex vocs:items-center vocs:justify-center vocs:size-20 vocs:rounded-full vocs:bg-surface vocs:border vocs:border-primary vocs:text-secondary vocs:mb-6"
      data-v-not-found-icon
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="1em"
        height="1em"
        viewBox="0 0 24 24"
        className="vocs:size-10"
        aria-hidden="true"
      >
        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}>
          <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zm6-5h.01" />
          <path d="M9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3" />
        </g>
      </svg>
    </div>

    <h1
      className="vocs:text-heading vocs:text-h1 vocs:font-medium vocs:tracking-[-0.04em] vocs:leading-h1 vocs:mb-3"
      data-v-not-found-title
    >
      Page not found
    </h1>

    <p
      className="vocs:text-secondary vocs:leading-p vocs:tracking-normal vocs:max-w-md vocs:mb-8"
      data-v-not-found-description
    >
      The page you're looking for doesn't exist or has been moved.
    </p>

    <Link
      className="vocs:inline-flex vocs:items-center vocs:gap-2 vocs:px-5 vocs:py-2.5 vocs:rounded-lg vocs:bg-surface vocs:border vocs:border-primary vocs:text-heading vocs:font-medium vocs:transition-colors vocs:duration-150 vocs:hover:bg-surfaceMuted"
      data-v-not-found-link
      to="/"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="1em"
        height="1em"
        viewBox="0 0 24 24"
        className="vocs:size-4 vocs:text-secondary"
        aria-hidden="true"
      >
        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}>
          <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
          <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </g>
      </svg>
      Back to home
    </Link>

    <nav className="not-found-recovery" aria-label="Where to look next">
      <p className="not-found-recovery-title">Where to look next</p>
      <ul>
        {recoveryLinks.map(({ path, label, note }) => (
          <li key={path}>
            <a href={path}>{label}</a>
            <span>: {note}</span>
          </li>
        ))}
      </ul>
    </nav>
  </div>
);

export default NotFound;
