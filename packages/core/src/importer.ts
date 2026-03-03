import fs from "fs";
import path from "path";
import type { Decision, DecisionCategory } from "./types.js";
import { ProjectMemory } from "./memory.js";

interface ImportResult {
  source: string;
  decisionsImported: number;
  notesImported: number;
  warnings: string[];
}

/**
 * Import context from existing platform-specific files into Anchor.
 */
export async function importContext(
  projectPath: string,
  memory: ProjectMemory
): Promise<ImportResult[]> {
  const project = memory.getProject(projectPath);
  if (!project) {
    throw new Error("Project not initialized. Run 'anchor init' first.");
  }

  const results: ImportResult[] = [];

  // Try each importer
  const importers = [
    { file: ".cursorrules", parser: parseCursorRules },
    { file: "CLAUDE.md", parser: parseClaudeMd },
    { file: ".windsurfrules", parser: parseWindsurfRules },
    { file: ".cursor/context.md", parser: parseCursorContext },
  ];

  for (const { file, parser } of importers) {
    const filePath = path.join(projectPath, file);
    if (!fs.existsSync(filePath)) continue;

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const parsed = parser(content);
      const result: ImportResult = {
        source: file,
        decisionsImported: 0,
        notesImported: 0,
        warnings: [],
      };

      // Import decisions (skip duplicates by title)
      const existingDecisions = memory.getDecisions(project.id);
      const existingTitles = new Set(existingDecisions.map((d) => d.title.toLowerCase()));

      for (const decision of parsed.decisions) {
        if (existingTitles.has(decision.title.toLowerCase())) {
          result.warnings.push(`Skipped duplicate decision: "${decision.title}"`);
          continue;
        }
        memory.addDecision(project.id, decision);
        result.decisionsImported++;
      }

      // Import notes (skip exact duplicates)
      const existingNotes = memory.getNotes(project.id);
      const existingNoteContents = new Set(existingNotes.map((n) => n.content));

      for (const note of parsed.notes) {
        if (existingNoteContents.has(note)) {
          continue;
        }
        memory.addNote(project.id, note);
        result.notesImported++;
      }

      results.push(result);
    } catch (err: any) {
      results.push({
        source: file,
        decisionsImported: 0,
        notesImported: 0,
        warnings: [`Failed to parse: ${err.message}`],
      });
    }
  }

  return results;
}

interface ParsedContext {
  decisions: Omit<Decision, "id" | "projectId" | "timestamp" | "status">[];
  notes: string[];
}

function parseCursorRules(content: string): ParsedContext {
  const decisions: ParsedContext["decisions"] = [];
  const notes: string[] = [];

  const lines = content.split("\n");
  let currentSection = "";
  let currentDecision: Partial<ParsedContext["decisions"][0]> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect section headers
    if (trimmed.startsWith("## ")) {
      currentSection = trimmed.replace("## ", "").toLowerCase();
      continue;
    }

    // Parse decisions from ### headers
    if (trimmed.startsWith("### ") && (currentSection.includes("decision") || currentSection.includes("architect"))) {
      if (currentDecision?.title) {
        decisions.push(finalizeDecision(currentDecision));
      }
      currentDecision = {
        title: trimmed.replace("### ", ""),
        description: "",
        category: "architecture" as DecisionCategory,
        tags: [],
      };
      continue;
    }

    // Collect decision content
    if (currentDecision) {
      if (trimmed.startsWith("Reasoning:") || trimmed.startsWith("Why:")) {
        currentDecision.reasoning = trimmed.replace(/^(Reasoning|Why):\s*/, "");
      } else if (trimmed && !trimmed.startsWith("<!--")) {
        currentDecision.description = currentDecision.description
          ? `${currentDecision.description} ${trimmed}`
          : trimmed;
      }
    }

    // Parse notes
    if (currentSection.includes("note") && trimmed.startsWith("- ")) {
      notes.push(trimmed.replace("- ", ""));
    }

    // Parse guidelines as decisions
    if (currentSection.includes("guideline") && trimmed.startsWith("- **")) {
      const match = trimmed.match(/- \*\*(.+?)\*\*:\s*(.+)/);
      if (match) {
        decisions.push({
          title: match[1],
          description: match[2],
          category: "other" as DecisionCategory,
          tags: [],
        });
      }
    }
  }

  // Don't forget last decision
  if (currentDecision?.title) {
    decisions.push(finalizeDecision(currentDecision));
  }

  return { decisions, notes };
}

function parseClaudeMd(content: string): ParsedContext {
  const decisions: ParsedContext["decisions"] = [];
  const notes: string[] = [];

  const lines = content.split("\n");
  let currentSection = "";
  let currentDecision: Partial<ParsedContext["decisions"][0]> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("## ")) {
      // Flush current decision
      if (currentDecision?.title) {
        decisions.push(finalizeDecision(currentDecision));
        currentDecision = null;
      }
      currentSection = trimmed.replace("## ", "").toLowerCase();
      continue;
    }

    if (trimmed.startsWith("### ") && (currentSection.includes("architecture") || currentSection.includes("decision"))) {
      if (currentDecision?.title) {
        decisions.push(finalizeDecision(currentDecision));
      }

      // Parse category from [CATEGORY] prefix
      const titleMatch = trimmed.match(/### \[(.+?)\]\s*(.+)/);
      currentDecision = {
        title: titleMatch ? titleMatch[2] : trimmed.replace("### ", ""),
        description: "",
        category: titleMatch
          ? (titleMatch[1].toLowerCase() as DecisionCategory)
          : ("architecture" as DecisionCategory),
        tags: [],
      };
      continue;
    }

    if (currentDecision) {
      if (trimmed.startsWith("> Reasoning:") || trimmed.startsWith("**Reasoning:**")) {
        currentDecision.reasoning = trimmed
          .replace(/^>\s*Reasoning:\s*/, "")
          .replace(/^\*\*Reasoning:\*\*\s*/, "");
      } else if (trimmed.startsWith("**Tags:**")) {
        currentDecision.tags = trimmed
          .replace("**Tags:**", "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
      } else if (trimmed && !trimmed.startsWith("*") && !trimmed.startsWith("<!--") && !trimmed.startsWith("- **")) {
        currentDecision.description = currentDecision.description
          ? `${currentDecision.description} ${trimmed}`
          : trimmed;
      }
    }

    // Parse guidelines
    if (currentSection.includes("guideline") && trimmed.startsWith("- **")) {
      const match = trimmed.match(/- \*\*(.+?)\*\*:?\s*(.+)/);
      if (match) {
        decisions.push({
          title: match[1].replace(":", ""),
          description: match[2],
          category: "other" as DecisionCategory,
          tags: [],
        });
      }
    }

    // Notes
    if (currentSection.includes("note") && trimmed.startsWith("- ")) {
      notes.push(trimmed.replace("- ", ""));
    }
  }

  if (currentDecision?.title) {
    decisions.push(finalizeDecision(currentDecision));
  }

  return { decisions, notes };
}

function parseWindsurfRules(content: string): ParsedContext {
  const decisions: ParsedContext["decisions"] = [];
  const notes: string[] = [];

  const lines = content.split("\n");
  let currentSection = "";

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("# ")) {
      currentSection = trimmed.replace("# ", "").toLowerCase();
      continue;
    }

    if (currentSection === "rules" && trimmed.startsWith("- ")) {
      const ruleText = trimmed.replace("- ", "");
      const colonIdx = ruleText.indexOf(":");
      if (colonIdx > 0) {
        decisions.push({
          title: ruleText.substring(0, colonIdx).trim(),
          description: ruleText.substring(colonIdx + 1).trim(),
          category: "other" as DecisionCategory,
          tags: [],
        });
      } else {
        notes.push(ruleText);
      }
    }

    if (currentSection === "notes" && trimmed.startsWith("- ")) {
      notes.push(trimmed.replace("- ", ""));
    }
  }

  return { decisions, notes };
}

function parseCursorContext(content: string): ParsedContext {
  // Re-use the Claude MD parser since format is similar
  return parseClaudeMd(content);
}

function finalizeDecision(
  partial: Partial<ParsedContext["decisions"][0]>
): ParsedContext["decisions"][0] {
  return {
    title: partial.title || "Untitled Decision",
    description: partial.description || "",
    reasoning: partial.reasoning,
    category: (partial.category as DecisionCategory) || "other",
    tags: partial.tags || [],
  };
}
