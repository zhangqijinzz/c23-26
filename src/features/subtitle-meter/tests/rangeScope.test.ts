import { describe, expect, it } from "vitest";
import {
  cueInRange,
  cuesInRanges,
  issuesInRanges,
  rangeStats,
} from "../analyzers/rangeScope";
import type { SubtitleCue, SubtitleIssue, TimeRange } from "../models";
const cue = (
  id: string,
  startMs: number,
  endMs: number,
  text = "字幕",
): SubtitleCue => ({ id, index: Number(id), startMs, endMs, text });
const range = (id: string, startMs: number, endMs: number): TimeRange => ({
  id,
  startMs,
  endMs,
});
const issue = (id: string, cueId: string): SubtitleIssue => ({
  id,
  cueId,
  type: "too-fast",
  severity: "warning",
  message: "m",
});
describe("range scope", () => {
  it("attributes cues by time overlap and excludes touching edges", () => {
    const r = range("r", 1000, 2000);
    expect(cueInRange(cue("1", 500, 1500), r)).toBe(true);
    expect(cueInRange(cue("2", 1500, 2500), r)).toBe(true);
    expect(cueInRange(cue("3", 0, 1000), r)).toBe(false);
    expect(cueInRange(cue("4", 2000, 3000), r)).toBe(false);
  });
  it("counts a cue spanning two ranges in both of them", () => {
    const cues = [cue("1", 800, 2200)];
    const a = range("a", 0, 1000),
      b = range("b", 2000, 3000);
    expect(rangeStats(cues, [], a).cueCount).toBe(1);
    expect(rangeStats(cues, [], b).cueCount).toBe(1);
    expect(cuesInRanges(cues, [a, b])).toHaveLength(1);
  });
  it("filters issues to cues inside the union of all ranges", () => {
    const cues = [cue("1", 0, 500), cue("2", 1000, 1500), cue("3", 9000, 9500)];
    const issues = [issue("i1", "1"), issue("i2", "2"), issue("i3", "3")];
    const scoped = issuesInRanges(issues, cues, [range("r", 900, 1600)]);
    expect(scoped.map((i) => i.id)).toEqual(["i2"]);
  });
  it("treats an empty selection as the whole project", () => {
    const cues = [cue("1", 0, 500), cue("2", 9000, 9500)];
    const issues = [issue("i1", "1"), issue("i2", "2")];
    expect(cuesInRanges(cues, [])).toEqual(cues);
    expect(issuesInRanges(issues, cues, [])).toEqual(issues);
  });
});
