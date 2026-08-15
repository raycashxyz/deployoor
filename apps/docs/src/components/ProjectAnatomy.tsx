"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { tokenize } from "../lib/highlight";
import { Link } from "vocs";
import { WORDMARKS } from "./WalletStrip";

/**
 * Scroll-driven tour of deployoor plugged into the project you already have, in the order the
 * files arrive.
 *
 * The steps scroll on the left as plain prose; one sticky panel on the right holds a file list that
 * accumulates as you go, with the current file highlighted and its source shown underneath. Files
 * carry a right-aligned `Optional` note where a step is genuinely skippable, so the shape of the
 * project reads straight off the list.
 *
 * Progressive enhancement: prerendered and with JS off, every file in the project is listed and every
 * step's prose is at full contrast — the panel shows the list without a snippet, because step 01 is
 * the project you already have and carries none. Once mounted, the active step is computed from the
 * scroll position, files reveal as you reach them, and the active step's code appears beneath the list.
 */

/**
 * Tools a step can cite, drawn as small logo chips.
 *
 * `icon: true` means a mark is vendored at `/icons/tools/<slug>.svg` (see public/icons/README.md for
 * the viewBox convention). The rest render a monogram in the same chip, so the row looks deliberate
 * until their marks land — add the file, flip the flag, nothing else changes.
 */
type Tool = { readonly label: string; readonly icon?: true };

const TOOLS = {
  hardhat: { label: "Hardhat", icon: true },
  foundry: { label: "Foundry", icon: true },
  viem: { label: "viem", icon: true },
  wagmi: { label: "wagmi", icon: true },
  tevm: { label: "tevm" },
  vitest: { label: "Vitest", icon: true },
  jest: { label: "Jest", icon: true },
} satisfies Readonly<Record<string, Tool>>;

/** The slugs `leverages` may name, so a typo is a build error rather than a chip that vanishes. */
type ToolSlug = keyof typeof TOOLS;

/** The starting project step 01 lets you pick; the tour's toolchain-specific bits follow it. */
type Toolchain = "hardhat" | "foundry";

/** The only flag worth carrying here: whether you need the file at all. */
type Note = "Optional";

type Step = {
  /** Heading prefix; `file` is appended as an inline code chip, matching "Choose your model in …". */
  title: string;
  /** `null` when the step is not about one file — the title then renders with no chip, so it
   *  must read as a complete phrase on its own. */
  file: string | null;
  /** Supports `**bold**` and `` `code` `` — see `renderInline`. */
  blurb: string;
  /** Tools this step leans on, drawn as small logo chips. Keyed to `TOOLS`, so a typo will not build. */
  leverages?: readonly ToolSlug[];
  /** Show the viem-wallet logo row — only the deploy-script step, where the signer is the point. */
  wallets?: boolean;
  /** A "read more" pointer into the docs. */
  link?: { readonly href: string; readonly label: string };
  /** Omitted when the panel should show only the file list (step 1 has no source worth reading). */
  code?: string;
  /** Render the Hardhat/Foundry switch under this step — its chips are the control. */
  toolchainSwitch?: true;
};

type FileRow = {
  path: string;
  /** Step at which the file joins the list. */
  appearsAt: number;
  /** Steps where this row is the highlighted one. Defaults to `[appearsAt]` — spelled out only
   *  when a step adds no file of its own (running the script highlights the script again). */
  activeAt?: readonly number[];
  note?: Note;
};

const ROOT = "my-project/";

/**
 * A step takes over once its top crosses this fraction of the viewport height. Well below the
 * sticky panel's own offset on purpose: a step should activate as soon as its heading is
 * comfortably on screen, not once it has climbed to the very top.
 */
const ACTIVATION_LINE = 0.4;

/**
 * The tour follows the toolchain picked in step 01. Only the starting files and the compile
 * command differ between the two — everything deployoor adds is byte-identical, which is
 * rather the point.
 */
const stepsFor = (toolchain: Toolchain): readonly Step[] => [
  {
    title: "Start with the project you have:",
    file: toolchain,
    blurb:
      toolchain === "hardhat"
        ? "Contracts in `contracts/`, config in `hardhat.config.js`, and the `artifacts/` that `hardhat compile` writes. **Nothing here changes.**"
        : "Contracts in `src/`, config in `foundry.toml`, and the `out/` that `forge build` writes. **Nothing here changes.**",
    toolchainSwitch: true,
  },
  {
    title: "Run one command:",
    file: "deployoor generate",
    blurb:
      "It scans your repo and finds your compiled artifacts by reading your **Hardhat or Foundry config**, then writes one typed deployer per contract. Wherever your build output goes, it looks there.",
    code:
      toolchain === "hardhat"
        ? `# artifacts/ — the path comes from your hardhat.config
npx hardhat compile

# → deployers/, one getOrDeploy per contract
npx deployoor generate`
        : `# out/ — the path comes from your foundry.toml
forge build

# → deployers/, one getOrDeploy per contract
npx deployoor generate`,
  },
  {
    title: "You get a typed deployer per contract in",
    file: "deployers/",
    blurb:
      "Constructor arguments are typed from the abi, so `args` gets checked instead of being a loose array. A deployer holds a name and an abi and nothing else — bytecode and compiler settings are read from your artifacts when you deploy — so these are small enough to **commit and read in a diff**.",
    code: `// AUTO-GENERATED by deployoor. Do not edit by hand.
import { defineDeployer } from "deployoor";
import type { Config } from "deployoor";
import { counterArtifact } from "./types/Counter";

// counterArtifact is a name + abi. The bytecode is read from
// artifacts/ at deploy time, so it is never copied in here.
// Counter's constructor is (uint256), so args is [bigint].
export const getOrDeployCounter = defineDeployer(
  counterArtifact,
  {} satisfies Config,
);`,
  },
  {
    title: "Deploy from a script in",
    file: "scripts/deploy.ts",
    blurb:
      "You pass in the viem clients you already have, so whatever signs for you elsewhere signs for your deploys: a local key, a KMS, an embedded wallet, a hardware wallet. deployoor reaches your wallet through viem alone and **never sees a key**.",
    wallets: true,
    link: { href: "/recipes", label: "Wallet recipes" },
    code: `// The one import that matters: your generated deployer.
import { getOrDeployCounter } from "../deployers";
import { publicClient, walletClient } from "./clients";

// Any viem clients. walletClient signs and needs a chain;
// publicClient reads. Neither is a deployoor type.
const { contract, freshDeploy } = await getOrDeployCounter({
  walletClient,
  publicClient,
  args: [7n], // typed from the constructor
});

// Say what happened: freshDeploy is true only when this
// run actually broadcast a deploy transaction.
console.log(freshDeploy ? "deployed" : "reused", contract.address);

// contract is a viem contract: .read.* and .write.* work.
console.log(await contract.read.number()); // 7n`,
  },
  {
    title: "Run it like any other script:",
    file: "tsx scripts/deploy.ts",
    blurb:
      "There is no framework to boot and no task runner, because it is a Node program. The first run deploys and records it. Run it again and you get **the same contract back, with no transaction**.",
    code: `# First run: deploys, then writes the record.
$ npx tsx scripts/deploy.ts
deployed 0x5FbDB2315678afecb367f032d93F642f64180aa3
7n

# Second run: reads the record, sends nothing.
$ npx tsx scripts/deploy.ts
reused 0x5FbDB2315678afecb367f032d93F642f64180aa3
7n`,
  },
  {
    title: "All deployments are recorded in",
    file: "deployments/",
    blurb:
      "One JSON file per contract per chain — the **permanent record** of what is deployed where. It is how later runs find the contract, how your app talks to it, and how `deployoor verify` proves it on an explorer **long after the deploy**.",
    link: { href: "/concepts/deployment-records", label: "Deployment records" },
    code: `deployments/11155111-sepolia/Counter.json

{
  "contractName": "Counter",
  "address": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  "chainId": 11155111,
  "constructorArgs": ["7"],
  "transactionHash": "0x…",
  "sourcesHash": "0x8f3a…"
}`,
  },
  {
    title: "Your tests can run standalone too",
    file: null,
    blurb:
      "`@deployoor/testing` bundles an **in-memory EVM** (tevm) exposed as plain viem clients, so tests run with no Hardhat test environment and no node to start — under **any runner**: Vitest, Jest, `node:test`, `bun test`.",
    leverages: ["vitest", "jest"],
    link: { href: "/guides/testing", label: "Testing guide" },
    code: `import { createTestClients } from "@deployoor/testing";
import { getOrDeployCounter } from "../deployers";

it("deploys with its constructor args", async () => {
  // An in-memory EVM exposed as viem clients, plus an
  // in-memory store, so nothing touches deployments/.
  const { contract } = await getOrDeployCounter({
    ...(await createTestClients()),
    args: [7n],
  });

  // A real deploy on a real EVM, just an in-process one.
  expect(await contract.read.number()).toBe(7n);
});`,
  },
  {
    title: "Consume it anywhere, via the wagmi plugin",
    file: null,
    blurb:
      "Your frontend reads **the same records** your deploy script wrote, through `@wagmi/cli`. Nothing is copied by hand, so an address cannot go stale in one repo while it is correct in the other.",
    leverages: ["wagmi", "viem"],
    link: { href: "/guides/consumption", label: "Consume in your app" },
    code: `import { defineConfig } from "@wagmi/cli";
import { actions } from "@wagmi/cli/plugins";
import { deployments } from "@deployoor/wagmi";

export default defineConfig({
  out: "src/generated.ts",
  plugins: [
    // reads deployments/ — the address and abi come from there
    deployments({ path: "./deployments" }),
    // actions() for viem, react() for hooks
    actions(),
  ],
});`,
  },
  {
    title: "And when you want to change something, there's",
    file: "deployoor.config.ts",
    blurb:
      "Every option has good defaults, but if you need custom configs or want to extend functionality via plugins, the `deployoor.config.ts` file is your friend.",
    link: { href: "/guides/verify", label: "Verify contracts" },
    code: `import { defineConfig } from "deployoor";
import { etherscan } from "@deployoor/etherscan";
import { sourcify } from "@deployoor/sourcify";
import { blockscout } from "@deployoor/blockscout";
import { routescan } from "@deployoor/routescan";
import { slack } from "@deployoor/slack";

export default defineConfig({
  // folders, only if yours are not the defaults
  out: "./generated/deployers",
  deploymentsPath: "./records",

  plugins: [
    // one Etherscan key covers every chain it supports
    etherscan({ apiKey: process.env.ETHERSCAN_API_KEY }),
    // keyless, and not owned by any explorer
    sourcify(),
    // Blockscout runs per chain, so name the instance
    blockscout({ instanceUrl: "https://eth-sepolia.blockscout.com" }),
    // mainnet vs testnet is worked out from the chain id
    routescan(),
    // and tell the team it happened
    slack({ webhook: process.env.SLACK_WEBHOOK }),
  ],
});`,
  },
];

const filesFor = (toolchain: Toolchain): readonly FileRow[] => [
  { path: toolchain === "hardhat" ? "hardhat.config.js" : "foundry.toml", appearsAt: 0 },
  { path: toolchain === "hardhat" ? "contracts/Counter.sol" : "src/Counter.sol", appearsAt: 0 },
  { path: toolchain === "hardhat" ? "artifacts/" : "out/", appearsAt: 0 },
  // Deliberately one row, not the whole emit. `generate` also writes `deployers/types/<Name>.ts` and
  // an `index.ts` barrel, but this is the first thing a visitor ever reads about deployoor and the
  // file that matters is the deployer. The full tree is in concepts/version-control.
  { path: "deployers/Counter.ts", appearsAt: 1, activeAt: [1, 2] },
  { path: "scripts/deploy.ts", appearsAt: 3, activeAt: [3, 4] },
  { path: "deployments/11155111-sepolia/Counter.json", appearsAt: 5 },
  { path: "test/counter.test.ts", appearsAt: 6, note: "Optional" },
  { path: "wagmi.config.ts", appearsAt: 7, note: "Optional" },
  { path: "deployoor.config.ts", appearsAt: 8, note: "Optional" },
];

const fileState = (file: FileRow, active: number): "active" | "seen" | "ahead" => {
  const activeAt = file.activeAt ?? [file.appearsAt];
  if (activeAt.includes(active)) return "active";
  return file.appearsAt <= active ? "seen" : "ahead";
};

/**
 * Render the sliver of markup the step blurbs use: `**bold**` for the one claim that matters and
 * `` `code` `` for filenames and commands. A full markdown pipeline for two constructs would be
 * more machinery than the copy needs, and keeping it this small is what stops the blurbs from
 * drifting into paragraphs of emphasis.
 */
const renderInline = (text: string) =>
  text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    return part;
  });

const ToolChips = ({ slugs }: { slugs: readonly ToolSlug[] }) => {
  return (
    <div className="anatomy-tools">
      {slugs.map((slug) => {
        // Annotated `Tool` so `icon` is readable across every entry, and indexed by a key of the
        // union so there is no missing-tool case left to drop silently.
        const tool: Tool = TOOLS[slug];
        return (
          <span className="tool-chip" key={slug}>
            {/* Decorative: `.tool-chip-label` below already names the tool in visible text, so
                labelling the mark too (and the wrapper via `title`) announces it three times. */}
            {tool.icon ? (
              <span className="tool-chip-icon" data-tool={slug} aria-hidden="true" />
            ) : (
              <span className="tool-chip-mono" aria-hidden="true">
                {tool.label.slice(0, 1)}
              </span>
            )}
            <span className="tool-chip-label">{tool.label}</span>
          </span>
        );
      })}
    </div>
  );
};

/** The toolchain options, in tab order — a module constant so the switch and its key handler
 *  agree on the sequence. */
const TOOLCHAINS = ["hardhat", "foundry"] as const;

/**
 * Maps a radiogroup key to the option index it should move to, or `null` to leave the event
 * alone. Home/End jump to the ends; the arrows step and wrap. This is the WAI-ARIA radio-group
 * pattern: arrows move selection **and** focus, so the group stays a single tab stop.
 */
const radioTargetIndex = (key: string, current: number, count: number): number | null => {
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowRight" || key === "ArrowDown") return (current + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp") return (current - 1 + count) % count;
  return null;
};

/**
 * Step 01's chips double as the toolchain control: same anatomy as the passive chips, but
 * as radio buttons, so picking Foundry re-flavours the starting files and the compile
 * command while everything deployoor adds stays identical.
 *
 * Roving tab stop: only the checked option is tabbable; arrows/Home/End move selection and
 * focus together, per the WAI-ARIA radio-group pattern.
 */
const ToolchainSwitch = ({ value, onChange }: { value: Toolchain; onChange: (next: Toolchain) => void }) => {
  const refs = useRef<Partial<Record<Toolchain, HTMLButtonElement | null>>>({});

  const select = (next: Toolchain) => {
    onChange(next);
    refs.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const target = radioTargetIndex(event.key, index, TOOLCHAINS.length);
    if (target === null) return;
    event.preventDefault();
    select(TOOLCHAINS[target]);
  };

  return (
    <div className="anatomy-tools" role="radiogroup" aria-label="Project toolchain">
      {TOOLCHAINS.map((slug, index) => (
        <button
          key={slug}
          ref={(node) => {
            refs.current[slug] = node;
          }}
          type="button"
          role="radio"
          aria-checked={value === slug}
          tabIndex={value === slug ? 0 : -1}
          className="tool-chip tool-chip-switch"
          data-active={value === slug ? "true" : "false"}
          onClick={() => onChange(slug)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          <span className="tool-chip-icon" data-tool={slug} aria-hidden="true" />
          <span className="tool-chip-label">{TOOLS[slug].label}</span>
        </button>
      ))}
    </div>
  );
};

const Code = ({ code }: { code: string }) => {
  return (
    <pre className="anatomy-code">
      <code>
        {tokenize(code).map((token, index) => (
          <span key={index} className={`tok-${token.kind}`}>
            {token.text}
          </span>
        ))}
      </code>
    </pre>
  );
};

export const ProjectAnatomy = () => {
  const [active, setActive] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [toolchain, setToolchain] = useState<Toolchain>("hardhat");
  const stepsRef = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    setMounted(true);

    // Derive the active step from the scroll position rather than from IntersectionObserver
    // callbacks. An observer only reports crossings it happens to see, so a fling that carries a
    // step clean past a thin trigger band between two frames leaves the panel showing whatever it
    // showed before — the state can desync from where you actually are, and scrolling back does not
    // necessarily resync it. This is a pure function of geometry, so every scroll event, in either
    // direction, recomputes the same answer from scratch.
    const compute = () => {
      const line = window.innerHeight * ACTIVATION_LINE;
      // Reduced over the raw refs, not a filtered copy: `index` has to be the index into the
      // steps array, and filtering first makes it an index into the filtered array. Those coincide only while
      // every step renders, so a step rendered conditionally would silently select the wrong one.
      // The last step whose top has passed the line; index 0 until the first one reaches it.
      setActive(
        stepsRef.current.reduce(
          (found, step, index) => (step !== null && step.getBoundingClientRect().top <= line ? index : found),
          0,
        ),
      );
    };

    // One recompute per frame at most. The flag lives on an object created here, so nothing
    // outside this effect can observe or reassign it.
    const frame = { pending: false };
    const onScroll = () => {
      if (frame.pending) return;
      frame.pending = true;
      requestAnimationFrame(() => {
        frame.pending = false;
        compute();
      });
    };

    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const steps = stepsFor(toolchain);
  const files = filesFor(toolchain);
  const step = steps[active] ?? steps[0];

  return (
    <section
      className="anatomy"
      aria-label="Your project, with deployoor plugged in"
      data-mounted={mounted ? "true" : "false"}
    >
      <header className="anatomy-head">
        <h2 className="anatomy-title">Your project, with deployoor plugged in</h2>
        <p className="anatomy-sub">From the project you already have to a typed, committed deployment.</p>
      </header>

      <div className="anatomy-grid">
        <ol className="anatomy-steps">
          {steps.map((entry, index) => (
            <li
              // Not keyed by `file` — that is null for steps that are not about one file.
              key={entry.title}
              className="anatomy-step"
              data-index={index}
              data-active={index === active ? "true" : "false"}
              ref={(node) => {
                stepsRef.current[index] = node;
              }}
            >
              <span className="anatomy-step-num">{String(index + 1).padStart(2, "0")}</span>
              <h3 className="anatomy-step-title">
                {entry.file === null ? (
                  entry.title
                ) : (
                  <>
                    {entry.title} <code>{entry.file}</code>
                  </>
                )}
              </h3>
              <p className="anatomy-step-blurb">{renderInline(entry.blurb)}</p>
              {entry.wallets ? (
                <div className="anatomy-step-wallets">
                  <p className="anatomy-step-wallets-caption">Works with any viem-compatible wallet</p>
                  {/* The .env badge is a filled shape rather than lettering, so as a mask at this
                      size it reads as a blob. The prose already says "a local key". */}
                  {WORDMARKS.filter((wordmark) => wordmark.slug !== "dotenv").map((wordmark) => (
                    <span
                      key={wordmark.slug}
                      className={`wordmark wordmark-${wordmark.slug}`}
                      role="img"
                      aria-label={wordmark.name}
                    />
                  ))}
                </div>
              ) : null}
              {entry.toolchainSwitch ? <ToolchainSwitch value={toolchain} onChange={setToolchain} /> : null}
              {entry.leverages ? <ToolChips slugs={entry.leverages} /> : null}
              {entry.link ? (
                <Link to={entry.link.href} className="anatomy-step-link">
                  {/* The label carries the underline, not the anchor: text-decoration propagates to
                      descendants, so decorating the anchor also underlines the gap and the arrow. */}
                  <span>{entry.link.label}</span>
                </Link>
              ) : null}
              {/* Shown only in the one-column layout, where the panel cannot follow along —
                  Vocs sets overflow-x on its content wrapper below md, which disables sticky. */}
              {entry.code === undefined ? null : (
                <div className="anatomy-step-code">
                  <Code code={entry.code} />
                </div>
              )}
            </li>
          ))}
        </ol>

        <aside className="anatomy-panel">
          <div className="anatomy-files">
            <p className="anatomy-files-root">{ROOT}</p>
            <ul className="anatomy-files-list">
              {files.map((file) => (
                <li key={file.path} className="anatomy-file" data-state={fileState(file, active)}>
                  <span className="anatomy-file-path">{file.path}</span>
                  {file.note ? <span className="anatomy-file-note">{file.note}</span> : null}
                </li>
              ))}
            </ul>
          </div>
          {step.code === undefined ? null : <Code code={step.code} />}
        </aside>
      </div>
    </section>
  );
};
