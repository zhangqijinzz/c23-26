import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cueInRanges,
  filterCuesByRanges,
  filterIssuesByRanges,
  mergeRanges,
} from "../analyzers/rangeFilter";
import { detectIssues } from "../analyzers/issueDetector";
import { formatSubtitles } from "../formatters/subtitleFormatter";
import type { SubtitleCue, TimeRange } from "../models";
import { SubtitleMeterViewModel } from "../viewmodels/subtitleMeterViewModel";
import { downloadSubtitles } from "../services/exportService";
vi.mock("../services/fileService", () => ({
  readTextFile: vi.fn(
    async () =>
      "1\n00:00:01,000 --> 00:00:02,000\nFirst\n\n2\n00:00:05,000 --> 00:00:06,000\nSecond\n\n3\n00:00:09,000 --> 00:00:10,000\nThird",
  ),
}));
vi.mock("../repositories/projectRepository", () => ({
  projectRepository: {
    save: vi.fn(async () => undefined),
    load: vi.fn(async () => null),
  },
}));
vi.mock("../services/exportService", () => ({ downloadSubtitles: vi.fn() }));
const cue = (
  id: string,
  startMs: number,
  endMs: number,
  text = "字幕",
): SubtitleCue => ({
  id,
  index: Number(id.replace(/\D/g, "")) || 0,
  startMs,
  endMs,
  text,
});
const range = (id: string, startMs: number, endMs: number): TimeRange => ({
  id,
  startMs,
  endMs,
});
describe("range merging", () => {
  it("keeps disjoint ranges sorted and separate", () => {
    expect(
      mergeRanges([range("b", 5000, 6000), range("a", 1000, 2000)]),
    ).toEqual([range("a", 1000, 2000), range("b", 5000, 6000)]);
  });
  it("merges overlapping and touching ranges", () => {
    expect(
      mergeRanges([
        range("a", 1000, 4000),
        range("b", 3000, 5000),
        range("c", 5000, 7000),
      ]),
    ).toEqual([{ id: "a", startMs: 1000, endMs: 7000 }]);
  });
});
describe("cue ownership rule", () => {
  const ranges = [range("r", 1000, 5000)];
  it("assigns a cue by its start time, half-open [start, end)", () => {
    expect(cueInRanges(cue("c1", 1000, 2000), ranges)).toBe(true);
    expect(cueInRanges(cue("c2", 4999, 6000), ranges)).toBe(true);
    expect(cueInRanges(cue("c3", 5000, 6000), ranges)).toBe(false);
    expect(cueInRanges(cue("c4", 0, 999), ranges)).toBe(false);
  });
  it("assigns boundary-crossing cues to exactly one range", () => {
    const crossingIn = cue("in", 4000, 9000),
      crossingOut = cue("out", 500, 1500),
      two = [range("a", 1000, 5000), range("b", 6000, 10000)];
    expect(cueInRanges(crossingIn, two)).toBe(true);
    expect(filterCuesByRanges([crossingIn], two)).toHaveLength(1);
    // 开始时间在区间外，即使跨入区间也不归属
    expect(cueInRanges(crossingOut, two)).toBe(false);
    expect(filterCuesByRanges([crossingOut], two)).toHaveLength(0);
    expect(cueInRanges(cue("x", 5000, 6000), two)).toBe(false);
  });
});
describe("scoped filtering", () => {
  const cues = [
    cue("cue-1", 0, 900, "早"),
    cue("cue-2", 2000, 2400, "中"),
    cue("cue-3", 8000, 8900, "晚"),
  ];
  it("returns everything when no range is selected", () => {
    expect(filterCuesByRanges(cues, [])).toBe(cues);
    expect(filterIssuesByRanges(detectIssues(cues), cues, [])).toEqual(
      detectIssues(cues),
    );
  });
  it("filters issues through their owning cue", () => {
    const issues = detectIssues(cues),
      ranges = [range("r", 1000, 5000)],
      scoped = filterIssuesByRanges(issues, cues, ranges);
    expect(scoped.length).toBeGreaterThan(0);
    expect(scoped.every((issue) => issue.cueId === "cue-2")).toBe(true);
  });
});
describe("view model ranges", () => {
  let vm: SubtitleMeterViewModel;
  beforeEach(async () => {
    vi.clearAllMocks();
    vm = new SubtitleMeterViewModel();
    await vm.importFile(new File(["x"], "film.srt"));
  });
  it("normalizes reversed drags and merges overlaps", () => {
    vm.addRange(4000, 2000);
    expect(vm.state.ranges).toEqual([
      { id: "range-1", startMs: 2000, endMs: 4000 },
    ]);
    vm.addRange(3000, 7000);
    expect(vm.state.ranges).toEqual([
      { id: "range-1", startMs: 2000, endMs: 7000 },
    ]);
  });
  it("exports only scoped cues with self-consistent numbering", async () => {
    vm.addRange(4000, 7000);
    await vm.exportSelection();
    const [name, cues] = vi.mocked(downloadSubtitles).mock.calls[0];
    expect(name).toBe("film-selection");
    expect(cues.map((c) => c.index)).toEqual([1]);
    expect(cues.map((c) => c.id)).toEqual(["cue-1"]);
    expect(cues[0].text).toBe("Second");
    expect(formatSubtitles(cues, "srt")).toMatch(/^1\n00:00:05,000/);
    expect(vm.state.notice).toContain("已导出选区内 1 条字幕");
  });
  it("refuses to export a range that contains no cues", async () => {
    vm.addRange(20000, 25000);
    await vm.exportSelection();
    expect(downloadSubtitles).not.toHaveBeenCalled();
    expect(vm.state.notice).toContain("无法导出");
    expect(vm.state.phase).toBe("ready");
  });
  it("restores the full-film scope after clearing ranges", async () => {
    vm.addRange(4000, 7000);
    vm.clearRanges();
    expect(vm.state.ranges).toEqual([]);
    await vm.exportFile();
    const [, cues] = vi.mocked(downloadSubtitles).mock.calls[0];
    expect(cues).toHaveLength(3);
  });
  it("resets ranges when a new file is imported", async () => {
    vm.addRange(0, 3000);
    await vm.importFile(new File(["x"], "next.srt"));
    expect(vm.state.ranges).toEqual([]);
  });
});
