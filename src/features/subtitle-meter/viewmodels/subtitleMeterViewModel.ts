import { detectIssues } from "../analyzers/issueDetector";
import { cuesInRanges } from "../analyzers/rangeScope";
import { formatSubtitles } from "../formatters/subtitleFormatter";
import {
  emptyState,
  type Format,
  type MeterState,
  type SubtitleCue,
  type SubtitleProject,
  type TimeRange,
} from "../models";
import { detectFormat, parseSubtitles } from "../parsers/subtitleParser";
import { projectRepository } from "../repositories/projectRepository";
import { downloadSubtitles } from "../services/exportService";
import { readTextFile } from "../services/fileService";
export class SubtitleMeterViewModel {
  state: MeterState = emptyState();
  private listeners = new Set<() => void>();
  private rangeSeq = 0;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.state;
  private publish(patch: Partial<MeterState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private async commit(
    project: SubtitleProject,
    phase: MeterState["phase"] = "editing",
  ) {
    project.updatedAt = Date.now();
    const issues = detectIssues(project.cues);
    this.publish({ project, issues, phase, notice: "" });
    try {
      await projectRepository.save(project);
    } catch {
      if (this.state.project?.updatedAt === project.updatedAt) {
        this.publish({
          phase: "error",
          notice: "本地保存失败；当前修改仍保留在页面中，请导出备份",
        });
      }
    }
  }
  async restore() {
    try {
      const project = await projectRepository.load();
      if (project)
        this.publish({
          project,
          issues: detectIssues(project.cues),
          phase: "ready",
          selectedId: project.cues[0]?.id ?? null,
          notice: "已恢复上次编辑",
        });
    } catch {
      this.publish({ notice: "本地项目暂时无法读取，可继续导入字幕文件" });
    }
  }
  async importFile(file: File) {
    this.publish({ phase: "importing", notice: "正在读取并解析字幕文件…" });
    try {
      const format = detectFormat(file.name),
        text = await readTextFile(file),
        cues = parseSubtitles(text, format);
      const project: SubtitleProject = {
        id: "subtitle-meter.current.v1",
        name: file.name,
        format,
        cues,
        updatedAt: Date.now(),
        versions: [],
      };
      this.publish({
        selectedId: cues[0].id,
        notice: `已解析 ${cues.length} 条字幕`,
        ranges: [],
      });
      await this.commit(project, "ready");
    } catch (error) {
      this.publish({
        phase: "error",
        notice:
          error instanceof Error ? error.message : "导入失败，请检查文件后重试",
      });
    }
  }
  selectCue(id: string) {
    this.publish({ selectedId: id });
  }
  addRange(startMs: number, endMs: number) {
    const start = Math.max(0, Math.min(startMs, endMs)),
      end = Math.max(startMs, endMs);
    if (end - start < 1) return;
    const sorted = [
      ...this.state.ranges,
      {
        id: `range-${Date.now()}-${this.rangeSeq++}`,
        startMs: start,
        endMs: end,
      },
    ].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
    const merged: TimeRange[] = [];
    for (const range of sorted) {
      const last = merged.at(-1);
      if (last && range.startMs <= last.endMs)
        last.endMs = Math.max(last.endMs, range.endMs);
      else merged.push({ ...range });
    }
    this.publish({ ranges: merged });
  }
  removeRange(id: string) {
    this.publish({ ranges: this.state.ranges.filter((r) => r.id !== id) });
  }
  clearRanges() {
    if (this.state.ranges.length) this.publish({ ranges: [] });
  }
  setZoom(zoom: number) {
    this.publish({ zoom });
  }
  async editCue(
    id: string,
    patch: Partial<Pick<SubtitleCue, "text" | "startMs" | "endMs">>,
  ) {
    if (!this.state.project) return;
    const cues = this.state.project.cues.map((cue) =>
      cue.id === id ? { ...cue, ...patch } : cue,
    );
    await this.commit({ ...this.state.project, cues });
  }
  async saveVersion() {
    const project = this.state.project;
    if (!project) return;
    const versions = [
      ...project.versions,
      {
        id: `v-${Date.now()}`,
        label: `快照 ${project.versions.length + 1}`,
        savedAt: Date.now(),
        cues: structuredClone(project.cues),
      },
    ];
    await this.commit({ ...project, versions });
    this.publish({ notice: "已保存版本快照" });
  }
  async restoreVersion(id: string) {
    const project = this.state.project,
      version = project?.versions.find((item) => item.id === id);
    if (!project || !version) return;
    await this.commit({ ...project, cues: structuredClone(version.cues) });
    this.publish({ notice: `已恢复${version.label}` });
  }
  async exportFile() {
    const project = this.state.project;
    if (!project) return;
    this.publish({ phase: "exporting" });
    try {
      formatSubtitles(project.cues, project.format);
      downloadSubtitles(project.name, project.cues, project.format);
      this.publish({ phase: "ready", notice: "字幕文件已导出" });
    } catch {
      this.publish({
        phase: "error",
        notice: "导出失败，编辑内容已保留，请重试",
      });
    }
  }
  async exportRange(id: string) {
    const project = this.state.project;
    if (!project) return;
    const index = this.state.ranges.findIndex((range) => range.id === id),
      range = this.state.ranges[index];
    if (!range) return;
    const cues = cuesInRanges(project.cues, [range]);
    if (!cues.length) {
      this.publish({ notice: `区间 ${index + 1} 内没有字幕条目，无法导出` });
      return;
    }
    this.publish({ phase: "exporting" });
    try {
      formatSubtitles(cues, project.format);
      downloadSubtitles(
        project.name,
        cues,
        project.format,
        `range${index + 1}`,
      );
      this.publish({
        phase: "ready",
        notice: `已导出区间 ${index + 1}（${cues.length} 条字幕）`,
      });
    } catch {
      this.publish({
        phase: "error",
        notice: "导出失败，编辑内容已保留，请重试",
      });
    }
  }
  setFormat(format: Format) {
    const project = this.state.project;
    if (project) void this.commit({ ...project, format });
  }
}
export const createViewModel = () => new SubtitleMeterViewModel();
