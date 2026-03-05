# ⚓ Anchor

**Project memory for vibecoders.** Keeps a living `AGENTS.md` in your repo so every AI tool always has full context.

## Install

### Download
Go to [Releases](https://github.com/bringthecode/anchor/releases) for Mac/Win/Linux binaries.

### Run from source
```bash
git clone https://github.com/bringthecode/anchor.git
cd anchor/apps/desktop-electron
npm install
npm run build
npx electron dist/main/index.js
```
Requirements: Node 18+

## How it works
1. Open Anchor and select your repo folder
2. Run the Vision Interview (~2 min) — Claude writes your product context into `AGENTS.md`
3. Log decisions and phases as you build
4. `AGENTS.md` auto-updates — every AI tool that opens the repo has full context

## License
MIT — [bringthecode.dev](https://bringthecode.dev)
