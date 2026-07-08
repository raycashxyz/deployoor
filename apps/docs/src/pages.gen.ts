// deno-fmt-ignore-file
// biome-ignore format: generated types do not need formatting
// prettier-ignore
import type { PathsForPages } from 'waku/router'

// prettier-ignore
type Page =
  | { path: '/concepts/deployment-records'; render: 'static' }
  | { path: '/concepts/idempotency'; render: 'static' }
  | { path: '/getting-started'; render: 'static' }
  | { path: '/getting-started/installation'; render: 'static' }
  | { path: '/getting-started/quickstart'; render: 'static' }
  | { path: '/guides/configuration'; render: 'static' }
  | { path: '/guides/consumption'; render: 'static' }
  | { path: '/guides/deploy'; render: 'static' }
  | { path: '/guides/foundry'; render: 'static' }
  | { path: '/guides/hardhat'; render: 'static' }
  | { path: '/guides/plugins'; render: 'static' }
  | { path: '/guides/testing'; render: 'static' }
  | { path: '/guides/tevm'; render: 'static' }
  | { path: '/'; render: 'static' }
  | { path: '/introduction'; render: 'static' }
  | { path: '/packages'; render: 'static' }
  | { path: '/reference/cli'; render: 'static' }

// prettier-ignore
declare module 'waku/router' {
  interface RouteConfig {
    paths: PathsForPages<Page>
  }
  interface CreatePagesConfig {
    pages: Page
  }
}
