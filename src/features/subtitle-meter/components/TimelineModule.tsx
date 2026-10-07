import { useState, type PointerEvent } from "react";
import { cueInRange, rangeStats } from "../analyzers/rangeScope";
import type {
  SubtitleCue,
  SubtitleIssue,
  SubtitleProject,
  TimeRange,
} from "../models";
import { formatTimestamp } from "../parsers/timecode";
import type { SubtitleMeterViewModel } from "../viewmodels/subtitleMeterViewModel";
export function TimelineModule({
  project,
  vm,
  selectedId,
  zoom,
  issues,
  ranges,
}: {
  project: SubtitleProject;
  vm: SubtitleMeterViewModel;
  selectedId: string | null;
  zoom: number;
  issues: SubtitleIssue[];
  ranges: TimeRange[];
}) {
  const maxTime = Math.max(1000, ...project.cues.map((cue) => cue.endMs));
  const [draft, setDraft] = useState<TimeRange | null>(null);
  const trackPointerDown = (
    event: PointerEvent<HTMLButtonElement>,
    cue: SubtitleCue,
  ) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const x0 = event.clientX,
      start = cue.startMs,
      end = cue.endMs,
      trackWidth =
        event.currentTarget.parentElement?.getBoundingClientRect().width ?? 1;
    let shift = 0;
    const move = (moveEvent: globalThis.PointerEvent) => {
      shift = Math.round(((moveEvent.clientX - x0) / trackWidth) * maxTime);
    };
    const done = () => {
      window.removeEventListener("pointerup", done);
      window.removeEventListener("pointermove", move);
      if (shift)
        void vm.editCue(cue.id, {
          startMs: Math.max(0, start + shift),
          endMs: Math.max(1, end + shift),
        });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", done, { once: true });
  };
  const rangePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect(),
      toMs = (clientX: number) =>
        Math.min(
          maxTime,
          Math.max(0, ((clientX - rect.left) / rect.width) * maxTime),
        ),
      anchor = toMs(event.clientX);
    let current = anchor;
    const move = (moveEvent: globalThis.PointerEvent) => {
      current = toMs(moveEvent.clientX);
      setDraft({
        id: "draft",
        startMs: Math.min(anchor, current),
        endMs: Math.max(anchor, current),
      });
    };
    const done = () => {
      window.removeEventListener("pointerup", done);
      window.removeEventListener("pointermove", move);
      setDraft(null);
      const minWidth = (3 / Math.max(1, rect.width)) * maxTime;
      if (Math.abs(current - anchor) >= minWidth)
        vm.addRange(Math.min(anchor, current), Math.max(anchor, current));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", done, { once: true });
  };
  const rangeStyle = (range: TimeRange) => ({
    left: `${(range.startMs / maxTime) * 100}%`,
    width: `${((range.endMs - range.startMs) / maxTime) * 100}%`,
  });
  return (
    <section className="module timeline-module">
      <div className="module-head">
        <div>
          <span className="module-kicker">02 / TIMELINE</span>
          <h2>时间轴分布</h2>
        </div>
        <label className="zoom-control">
          缩放{" "}
          <input
            aria-label="时间轴缩放"
            type="range"
            min="0.6"
            max="2"
            step="0.1"
            value={zoom}
            onChange={(e) => vm.setZoom(Number(e.target.value))}
          />
        </label>
      </div>
      <div className="time-ruler">
        <span>00:00</span>
        <span>{(maxTime / 2000).toFixed(0)}s</span>
        <span>{(maxTime / 1000).toFixed(0)}s</span>
      </div>
      <div
        className="timeline-track"
        style={{ minWidth: `${zoom * 100}%` }}
        onPointerDown={rangePointerDown}
      >
        {ranges.map((range) => (
          <span
            key={range.id}
            className="timeline-range"
            style={rangeStyle(range)}
          />
        ))}
        {draft && (
          <span className="timeline-range draft" style={rangeStyle(draft)} />
        )}
        {project.cues.map((cue) => (
          <button
            key={cue.id}
            title={`第 ${cue.index} 条 · ${(cue.startMs / 1000).toFixed(2)}s`}
            className={`timeline-cue ${selectedId === cue.id ? "selected" : ""} ${
              ranges.length && !ranges.some((range) => cueInRange(cue, range))
                ? "out-of-scope"
                : ""
            }`}
            style={{
              left: `${(cue.startMs / maxTime) * 100}%`,
              width: `${Math.max(2.5, ((cue.endMs - cue.startMs) / maxTime) * 100)}%`,
            }}
            onClick={() => vm.selectCue(cue.id)}
            onPointerDown={(event) => trackPointerDown(event, cue)}
          >
            {cue.index}
          </button>
        ))}
      </div>
      {ranges.length > 0 && (
        <div className="range-list">
          <div className="range-list-head">
            <span>检查区间 · {ranges.length}</span>
            <button onClick={() => vm.clearRanges()}>全部清除</button>
          </div>
          {ranges.map((range, i) => {
            const stats = rangeStats(project.cues, issues, range);
            return (
              <div key={range.id} className="range-row">
                <span className="range-name">区间 {i + 1}</span>
                <span className="range-time">
                  {formatTimestamp(range.startMs, project.format)} →{" "}
                  {formatTimestamp(range.endMs, project.format)}
                </span>
                <span className="range-stats">
                  {stats.cueCount} 条字幕 · {stats.issueCount} 问题
                </span>
                <button
                  aria-label={`删除区间 ${i + 1}`}
                  onClick={() => vm.removeRange(range.id)}
                >
                  ✕
                </button>
              </div>
            );
          })}
          <p className="range-rule">
            条目与区间时间交叠即归属该区间，跨区间条目同时计入各区间。
          </p>
        </div>
      )}
      <div className="timeline-hint">
        在轨道空白处拖动可框选检查区间 · 拖动时间块调整起止位置 ·
        点击条目进行编辑
      </div>
    </section>
  );
}
