import type { Format, SubtitleProject, TimeRange } from "../models";
import type { SubtitleMeterViewModel } from "../viewmodels/subtitleMeterViewModel";
export function VersionExportModule({
  project,
  vm,
  phase,
  ranges,
  scopedCount,
}: {
  project: SubtitleProject;
  vm: SubtitleMeterViewModel;
  phase: string;
  ranges: TimeRange[];
  scopedCount: number;
}) {
  const scoped = ranges.length > 0,
    exportable = !scoped || scopedCount > 0;
  return (
    <section className="module version-module">
      <div className="module-head">
        <div>
          <span className="module-kicker">04 / VERSIONS & EXPORT</span>
          <h2>版本与交付</h2>
        </div>
        <span className="saved-label">● 自动保存</span>
      </div>
      <div className="version-row">
        <div>
          <strong>本地快照</strong>
          <small>
            {project.versions.length
              ? `最近：${project.versions.at(-1)?.label}`
              : "保存当前版本以便回退"}
          </small>
        </div>
        <button
          className="secondary-button"
          onClick={() => void vm.saveVersion()}
        >
          ＋ 保存快照
        </button>
      </div>
      {project.versions.length > 0 && (
        <div className="version-list">
          {project.versions.map((version) => (
            <button
              key={version.id}
              onClick={() => void vm.restoreVersion(version.id)}
            >
              {version.label}
              <span>恢复 ↗</span>
            </button>
          ))}
        </div>
      )}
      <div className="export-row">
        <label>
          格式
          <select
            aria-label="导出格式"
            value={project.format}
            onChange={(e) => vm.setFormat(e.target.value as Format)}
          >
            <option value="srt">SRT</option>
            <option value="vtt">WebVTT</option>
          </select>
        </label>
        <button
          className="export-button"
          disabled={phase === "exporting" || !exportable}
          onClick={() =>
            scoped ? void vm.exportSelection() : void vm.exportFile()
          }
        >
          {scoped ? `导出选中区间（${scopedCount} 条）` : "导出字幕"}{" "}
          <span>↓</span>
        </button>
      </div>
      <div className={`export-scope ${scoped && !scopedCount ? "empty" : ""}`}>
        {scoped
          ? scopedCount
            ? `导出范围：${ranges.length} 个区间 · 编号将从 1 重新编排`
            : "选中区间内没有字幕条目，无法导出"
          : `导出范围：全片 ${project.cues.length} 条`}
      </div>
      <p className="privacy-note">字幕文件与项目版本仅保存在当前浏览器</p>
    </section>
  );
}
