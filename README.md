# ⚓ Anchor

**Own your AI-coded projects.**

Anchor is a platform-agnostic project memory and context portability tool for vibecoding. It sits between you and your AI coding tools — ensuring you never lose context, decisions, or momentum when switching between platforms.

## The Problem

You build with Cursor, then try Claude Code, then Windsurf. Each time you switch:
- Context is lost
- Architectural decisions vanish
- You spend 30 minutes re-explaining your project
- The AI makes mistakes you already corrected

**Your project should belong to you, not your platform.**

## The Solution

Anchor maintains a living project memory in a `.anchor/` directory. It tracks your tech stack, architectural decisions, and project context — then exports it to whatever AI coding tool you use next.

```bash
# Initialize in any project
anchor init

# Record decisions as you build
anchor decide -t "Use Drizzle ORM" -d "Chose Drizzle over Prisma for edge compatibility" -c technology

# Add quick notes
anchor note "Remember to add rate limiting to all public endpoints"

# Export to any platform
anchor export cursor       # → .cursorrules + .cursor/context.md
anchor export claude-code  # → CLAUDE.md
anchor export windsurf     # → .windsurfrules
anchor export markdown     # → PROJECT-CONTEXT.md
anchor export json         # → anchor-context.json
anchor export --all        # → All of the above

# Import from existing context files
anchor import              # Reads .cursorrules, CLAUDE.md, .windsurfrules

# See what changed since last export
anchor diff

# Watch for changes in real-time
anchor watch

# Generate an AI-powered project summary
ANTHROPIC_API_KEY=sk-ant-... anchor summary
```

## Features

- **Auto Stack Detection** — Automatically identifies your frameworks, languages, build tools, and databases
- **Decision Log** — Record architectural decisions with reasoning and categories (ADR-style)
- **Multi-Platform Export** — One project memory, exported to Cursor, Claude Code, Windsurf, Markdown, or JSON
- **Import** — Read existing `.cursorrules`, `CLAUDE.md`, or `.windsurfrules` into Anchor
- **Diff** — See what changed since your last export
- **Watch Mode** — Auto-update project memory on file changes
- **AI Summary** — Generate intelligent project summaries via Anthropic API
- **Git-Aware** — Reads branch, commit history, and change status
- **File Tree Mapping** — Smart project structure scanning with sensible defaults
- **Quick Notes** — `anchor note "..."` for fast context capture
- **Desktop App** — Tauri-based GUI for managing projects (coming soon)

## Installation

```bash
npm install -g @anchor/cli
```

## Commands

| Command | Description |
|---------|-------------|
| `anchor init` | Initialize Anchor in current project |
| `anchor status` | Show project overview |
| `anchor decide` | Record an architectural decision |
| `anchor note <text>` | Add a quick note |
| `anchor export <target>` | Export context to a platform |
| `anchor import` | Import from existing context files |
| `anchor diff` | Show changes since last export |
| `anchor watch` | Watch project for changes |
| `anchor summary` | AI-powered project summary |
| `anchor decisions` | List all decisions |
| `anchor targets` | Show available export targets |
| `anchor reset` | Remove Anchor from project |

## Export Targets

| Target | Files Generated | Best For |
|--------|----------------|----------|
| `cursor` | `.cursorrules`, `.cursor/context.md` | Cursor IDE |
| `claude-code` | `CLAUDE.md` | Claude Code CLI |
| `windsurf` | `.windsurfrules` | Windsurf IDE |
| `markdown` | `PROJECT-CONTEXT.md` | Any tool / documentation |
| `json` | `anchor-context.json` | Machine-readable / integrations |

## How It Works

```
Your Project
    │
    ├── .anchor/              ← Anchor's project memory (gitignored)
    │   ├── memory.db         ← SQLite: decisions, notes, stack
    │   ├── anchor.json       ← Config
    │   └── last-export.json  ← Baseline for diff
    │
    ├── .cursorrules          ← anchor export cursor
    ├── CLAUDE.md             ← anchor export claude-code
    ├── .windsurfrules        ← anchor export windsurf
    ├── PROJECT-CONTEXT.md    ← anchor export markdown
    └── anchor-context.json   ← anchor export json
```

## Architecture

```
anchor/
├── packages/
│   ├── core/          # Project memory engine, stack detection, file scanning,
│   │                  # import, diff, context snapshots
│   ├── exporters/     # Platform-specific exporters (plugin architecture)
│   └── watchers/      # File system watchers (chokidar)
├── apps/
│   ├── cli/           # Command-line interface (commander)
│   └── desktop/       # Tauri + React desktop app
```

## Workflow Example

```bash
# 1. Start a project in Cursor
cd my-project
anchor init
anchor decide -t "Use tRPC" -d "Type-safe API layer" -c technology
anchor export cursor

# 2. Build for a while, then want to try Claude Code
anchor decide -t "Add Stripe billing" -d "Using Stripe Checkout + webhooks" -c architecture
anchor export claude-code
# → CLAUDE.md now contains all your decisions + context

# 3. Come back to Cursor next week
anchor diff           # See what changed
anchor export cursor  # Update .cursorrules with latest state

# 4. Someone else joins with Windsurf
anchor export windsurf  # They get the full context instantly
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for details on adding exporters, import parsers, and more.

## License

MIT

---

*Built for the vibecoding community. Your projects belong to you.*

**[yourcode.dev](https://yourcode.dev)**
