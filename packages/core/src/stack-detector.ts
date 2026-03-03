import fs from "fs";
import path from "path";
import type { TechStack } from "./types.js";

interface DetectionRule {
  file: string;
  detect: (content: string) => Partial<TechStack>;
}

const DETECTION_RULES: DetectionRule[] = [
  {
    file: "package.json",
    detect: (content) => {
      const pkg = JSON.parse(content);
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };
      const stack: Partial<TechStack> = {
        languages: ["TypeScript", "JavaScript"].filter(
          (l) =>
            l === "JavaScript" ||
            allDeps["typescript"] ||
            fs.existsSync("tsconfig.json")
        ),
        frameworks: [],
        buildTools: [],
        runtime: "Node.js",
      };

      // Frameworks
      const frameworkMap: Record<string, string> = {
        react: "React",
        next: "Next.js",
        vue: "Vue",
        nuxt: "Nuxt",
        svelte: "Svelte",
        "@sveltejs/kit": "SvelteKit",
        express: "Express",
        fastify: "Fastify",
        hono: "Hono",
        "react-native": "React Native",
        electron: "Electron",
        "@tauri-apps/api": "Tauri",
        astro: "Astro",
        remix: "Remix",
        gatsby: "Gatsby",
        angular: "Angular",
      };

      for (const [dep, name] of Object.entries(frameworkMap)) {
        if (allDeps[dep]) stack.frameworks!.push(name);
      }

      // Build tools
      const buildToolMap: Record<string, string> = {
        vite: "Vite",
        webpack: "Webpack",
        esbuild: "esbuild",
        rollup: "Rollup",
        turbo: "Turborepo",
        tsup: "tsup",
        parcel: "Parcel",
      };

      for (const [dep, name] of Object.entries(buildToolMap)) {
        if (allDeps[dep]) stack.buildTools!.push(name);
      }

      // Databases
      const dbMap: Record<string, string> = {
        prisma: "Prisma",
        "@prisma/client": "Prisma",
        drizzle: "Drizzle",
        "drizzle-orm": "Drizzle",
        mongoose: "MongoDB",
        pg: "PostgreSQL",
        mysql2: "MySQL",
        "better-sqlite3": "SQLite",
        redis: "Redis",
        ioredis: "Redis",
      };

      stack.databases = [];
      for (const [dep, name] of Object.entries(dbMap)) {
        if (allDeps[dep] && !stack.databases.includes(name)) {
          stack.databases.push(name);
        }
      }

      // Package manager detection
      if (fs.existsSync("pnpm-lock.yaml")) stack.packageManager = "pnpm";
      else if (fs.existsSync("yarn.lock")) stack.packageManager = "yarn";
      else if (fs.existsSync("bun.lockb")) stack.packageManager = "bun";
      else stack.packageManager = "npm";

      return stack;
    },
  },
  {
    file: "requirements.txt",
    detect: (content) => {
      const stack: Partial<TechStack> = {
        languages: ["Python"],
        frameworks: [],
        runtime: "Python",
        databases: [],
      };

      if (content.includes("django")) stack.frameworks!.push("Django");
      if (content.includes("flask")) stack.frameworks!.push("Flask");
      if (content.includes("fastapi")) stack.frameworks!.push("FastAPI");
      if (content.includes("sqlalchemy")) stack.databases!.push("SQLAlchemy");

      return stack;
    },
  },
  {
    file: "Cargo.toml",
    detect: () => ({
      languages: ["Rust"],
      runtime: "Rust",
    }),
  },
  {
    file: "go.mod",
    detect: () => ({
      languages: ["Go"],
      runtime: "Go",
    }),
  },
];

export async function detectStack(projectPath: string): Promise<TechStack> {
  const stack: TechStack = {
    languages: [],
    frameworks: [],
    buildTools: [],
    databases: [],
  };

  for (const rule of DETECTION_RULES) {
    const filePath = path.join(projectPath, rule.file);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const detected = rule.detect(content);
        if (detected.languages)
          stack.languages.push(
            ...detected.languages.filter((l) => !stack.languages.includes(l))
          );
        if (detected.frameworks)
          stack.frameworks.push(
            ...detected.frameworks.filter((f) => !stack.frameworks.includes(f))
          );
        if (detected.buildTools)
          stack.buildTools.push(
            ...detected.buildTools.filter((b) => !stack.buildTools.includes(b))
          );
        if (detected.databases)
          stack.databases.push(
            ...detected.databases.filter((d) => !stack.databases.includes(d))
          );
        if (detected.runtime && !stack.runtime) stack.runtime = detected.runtime;
        if (detected.packageManager && !stack.packageManager)
          stack.packageManager = detected.packageManager;
      } catch {
        // Skip files that can't be parsed
      }
    }
  }

  return stack;
}
