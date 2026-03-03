# Contributing to Anchor

Thanks for your interest in contributing to Anchor! This project exists to give vibecoding developers ownership of their projects across AI coding platforms.

## Getting Started

```bash
# Clone the repo
git clone https://github.com/bringthecode/anchor.git
cd anchor

# Install dependencies
npm install

# Build all packages
npm run build

# Test the CLI locally
cd /tmp && mkdir test-project && cd test-project
npm init -y
node /path/to/anchor/apps/cli/dist/index.js init
```

## Project Structure

```
anchor/
├── packages/
│   ├── core/          # Project memory engine, stack detection, file scanning
│   ├── exporters/     # Platform-specific exporters (plugin architecture)
│   └── watchers/      # File system watchers
├── apps/
│   ├── cli/           # Command-line interface
│   └── desktop/       # Tauri + React desktop app
```

## Adding a New Exporter

Exporters are the most straightforward way to contribute. To add support for a new AI coding tool:

1. Create a new file in `packages/exporters/src/` (e.g., `my-tool.ts`)
2. Implement the `Exporter` interface:

```typescript
import type { ContextSnapshot, ExportedFile } from "@bringthecode/core";
import type { Exporter } from "./base.js";

export class MyToolExporter implements Exporter {
  readonly name = "my-tool";
  readonly description = "Export for My Tool";
  readonly targetFiles = [".my-tool-config"];

  export(snapshot: ContextSnapshot): ExportedFile[] {
    return [{
      path: ".my-tool-config",
      content: this.buildConfig(snapshot),
    }];
  }

  private buildConfig(snapshot: ContextSnapshot): string {
    // Build the output format your tool expects
    return "";
  }
}
```

3. Register it in `packages/exporters/src/index.ts`
4. That's it — the CLI picks it up automatically

## Areas Where Help Is Needed

- **New exporters** — Aider, Copilot Workspace, Cody, etc.
- **Import parsers** — Better parsing of existing context files
- **Desktop app** — Tauri commands for file system operations
- **Tests** — Unit tests for core modules
- **Documentation** — Usage guides, video tutorials

## Code Style

- TypeScript strict mode
- ESM modules (`"type": "module"`)
- Prefer descriptive function names over comments

## Pull Requests

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-exporter`)
3. Make your changes
4. Build and test (`npm run build`)
5. Open a PR with a clear description

## Reporting Issues

Please include:
- Your OS and Node.js version
- Steps to reproduce
- Expected vs actual behavior
- The output of `anchor status` if relevant
