import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

describe("migrations folder", () => {
  it("has numbered migration files in order", () => {
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".js"))
      .sort();
    expect(files.length).toBeGreaterThanOrEqual(2);
    expect(files[0]).toMatch(/^001_/);
    expect(files[1]).toMatch(/^002_/);
  });

  it("exports id and up/down from each migration", async () => {
    const m1 = await import("../migrations/001_bootstrap_indexes.js");
    const m2 = await import("../migrations/002_wave1_field_backfills.js");
    for (const mod of [m1, m2]) {
      expect(mod.id).toBeTruthy();
      expect(typeof mod.up).toBe("function");
      expect(typeof mod.down).toBe("function");
    }
  });
});
