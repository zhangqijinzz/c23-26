import { beforeEach, describe, expect, it, vi } from "vitest";
import { SubtitleMeterViewModel } from "../viewmodels/subtitleMeterViewModel";
import { readTextFile } from "../services/fileService";
import { downloadSubtitles } from "../services/exportService";
vi.mock("../services/fileService", () => ({
  readTextFile: vi.fn(
    async () => "1\n00:00:01,000 --> 00:00:03,000\nOriginal caption",
  ),
}));
vi.mock("../repositories/projectRepository", () => ({
  projectRepository: {
    save: vi.fn(async () => undefined),
    load: vi.fn(async () => null),
  },
}));
vi.mock("../services/exportService", () => ({ downloadSubtitles: vi.fn() }));
describe("SubtitleMeterViewModel", () => {
  let vm: SubtitleMeterViewModel;
  beforeEach(() => {
    vi.clearAllMocks();
    vm = new SubtitleMeterViewModel();
  });
  it("imports, edits, rechecks, snapshots, and exports", async () => {
    await vm.importFile(new File(["x"], "clip.srt"));
    expect(vm.state.phase).toBe("ready");
    const cue = vm.state.project!.cues[0];
    await vm.editCue(cue.id, { text: "Edited" });
    expect(vm.state.project!.cues[0].text).toBe("Edited");
    await vm.saveVersion();
    expect(vm.state.project!.versions).toHaveLength(1);
    await vm.exportFile();
    expect(vm.state.notice).toBe("字幕文件已导出");
  });
  it("keeps a recoverable error when an unsupported import is selected", async () => {
    await vm.importFile(new File(["x"], "clip.txt"));
    expect(vm.state.phase).toBe("error");
    expect(vm.state.notice).toContain("仅支持");
  });
  it("shows a parse failure as a recoverable import error", async () => {
    vi.mocked(readTextFile).mockResolvedValueOnce("not a subtitle block");
    await vm.importFile(new File(["x"], "clip.srt"));
    expect(vm.state.phase).toBe("error");
    expect(vm.state.notice).toContain("缺少时间码");
  });
  it("keeps editing visible immediately and reports export failures", async () => {
    await vm.importFile(new File(["x"], "clip.srt"));
    const cue = vm.state.project!.cues[0];
    const saving = vm.editCue(cue.id, { text: "Immediate edit" });
    expect(vm.state.project!.cues[0].text).toBe("Immediate edit");
    await saving;
    vi.mocked(downloadSubtitles).mockImplementationOnce(() => {
      throw new Error("download unavailable");
    });
    await vm.exportFile();
    expect(vm.state.phase).toBe("error");
    expect(vm.state.notice).toContain("导出失败");
    expect(vm.state.project!.cues[0].text).toBe("Immediate edit");
  });
  describe("time ranges", () => {
    const threeCues =
      "1\n00:00:01,000 --> 00:00:02,000\n一\n\n2\n00:00:05,000 --> 00:00:06,000\n二\n\n3\n00:00:09,000 --> 00:00:10,000\n三";
    beforeEach(async () => {
      vi.mocked(readTextFile).mockResolvedValueOnce(threeCues);
      await vm.importFile(new File(["x"], "clip.srt"));
    });
    it("merges overlapping or touching ranges and keeps them sorted", () => {
      vm.addRange(8000, 11000);
      vm.addRange(4000, 7000);
      vm.addRange(6000, 8500);
      expect(vm.state.ranges).toEqual([
        expect.objectContaining({ startMs: 4000, endMs: 11000 }),
      ]);
      vm.addRange(0, 1000);
      expect(vm.state.ranges.map((r) => [r.startMs, r.endMs])).toEqual([
        [0, 1000],
        [4000, 11000],
      ]);
    });
    it("ignores degenerate ranges", () => {
      vm.addRange(5000, 5000);
      expect(vm.state.ranges).toEqual([]);
    });
    it("exports only the cues overlapping a range, with a range label", async () => {
      vm.addRange(4500, 7000);
      await vm.exportRange(vm.state.ranges[0].id);
      expect(vi.mocked(downloadSubtitles)).toHaveBeenCalledWith(
        "clip.srt",
        [expect.objectContaining({ startMs: 5000 })],
        "srt",
        "range1",
      );
      expect(vm.state.notice).toContain("1 条字幕");
    });
    it("refuses to export a range without any cues", async () => {
      vm.addRange(20000, 25000);
      await vm.exportRange(vm.state.ranges[0].id);
      expect(vi.mocked(downloadSubtitles)).not.toHaveBeenCalled();
      expect(vm.state.notice).toContain("无法导出");
    });
    it("restores the full-project scope after ranges are cleared", () => {
      vm.addRange(0, 4000);
      vm.addRange(8000, 12000);
      vm.removeRange(vm.state.ranges[0].id);
      expect(vm.state.ranges).toHaveLength(1);
      vm.clearRanges();
      expect(vm.state.ranges).toEqual([]);
    });
    it("resets ranges when a new project is imported", async () => {
      vm.addRange(0, 4000);
      vi.mocked(readTextFile).mockResolvedValueOnce(threeCues);
      await vm.importFile(new File(["x"], "next.srt"));
      expect(vm.state.ranges).toEqual([]);
    });
  });
});
