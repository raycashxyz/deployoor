// deno-fmt-ignore-file
// biome-ignore format: generated types do not need formatting
// prettier-ignore
import type { PathsForPages } from 'waku/router'

// prettier-ignore
type Page =
  | { path: '/_api/api/og'; render: 'static' }
  | { path: '/_slots'; render: 'static' }
  | { path: '/changelog'; render: 'static' }
  | { path: '/comparison/hardhat-deploy'; render: 'static' }
  | { path: '/comparison/hardhat-ignition'; render: 'static' }
  | { path: '/comparison/hardhat'; render: 'static' }
  | { path: '/comparison'; render: 'static' }
  | { path: '/concepts/deployment-records'; render: 'static' }
  | { path: '/concepts/deployment-stores'; render: 'static' }
  | { path: '/concepts/idempotency'; render: 'static' }
  | { path: '/concepts/version-control'; render: 'static' }
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
  | { path: '/migrate/hardhat-deploy'; render: 'static' }
  | { path: '/migrate/hardhat-ignition'; render: 'static' }
  | { path: '/migrate/hardhat'; render: 'static' }
  | { path: '/packages'; render: 'static' }
  | { path: '/recipes/coinbase-cdp'; render: 'static' }
  | { path: '/recipes'; render: 'static' }
  | { path: '/recipes/openfort'; render: 'static' }
  | { path: '/recipes/privy'; render: 'static' }
  | { path: '/recipes/turnkey'; render: 'static' }
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
