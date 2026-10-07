import { useState, type PointerEvent } from "react";
import { cueInRanges } from "../analyzers/rangeFilter";
import type { SubtitleCue, SubtitleProject, TimeRange } from "../models";
import type { SubtitleMeterViewModel } from "../viewmodels/subtitleMeterViewModel";
const formatRangeTime = (ms: number) => {
  const minutes = Math.floor(ms / 60000),
    seconds = ((ms % 60000) / 1000).toFixed(1).padStart(4, "0");
  return `${String(minutes).padStart(2, "0")}:${seconds}`;
};
export function TimelineModule({
  project,
  vm,
  selectedId,
  zoom,
  ranges,
}: {
  project: SubtitleProject;
  vm: SubtitleMeterViewModel;
  selectedId: string | null;
  zoom: number;
  ranges: TimeRange[];
}) {
  const maxTime = Math.max(1000, ...project.cues.map((cue) => cue.endMs));
  const [draft, setDraft] = useState<{ startMs: number; endMs: number } | null>(
    null,
  );
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
      x0 = event.clientX,
      origin = toMs(x0);
    let current = origin;
    setDraft({ startMs: origin, endMs: origin });
    const move = (moveEvent: globalThis.PointerEvent) => {
      current = toMs(moveEvent.clientX);
      setDraft({
        startMs: Math.min(origin, current),
        endMs: Math.max(origin, current),
      });
    };
    const done = (upEvent: globalThis.PointerEvent) => {
      window.removeEventListener("pointerup", done);
      window.removeEventListener("pointermove", move);
      setDraft(null);
      if (Math.abs(upEvent.clientX - x0) >= 6) vm.addRange(origin, current);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", done, { once: true });
  };
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
          <div
            key={range.id}
            className="timeline-range"
            style={{
              left: `${(range.startMs / maxTime) * 100}%`,
              width: `${((range.endMs - range.startMs) / maxTime) * 100}%`,
            }}
          >
            <button
              aria-label="删除区间"
              className="range-delete"
              onClick={() => vm.removeRange(range.id)}
              onPointerDown={(event) => event.stopPropagation()}
            >
              ×
            </button>
          </div>
        ))}
        {draft && (
          <div
            className="timeline-range draft"
            style={{
              left: `${(draft.startMs / maxTime) * 100}%`,
              width: `${Math.max(0.5, ((draft.endMs - draft.startMs) / maxTime) * 100)}%`,
            }}
          />
        )}
        {project.cues.map((cue) => (
          <button
            key={cue.id}
            title={`第 ${cue.index} 条 · ${(cue.startMs / 1000).toFixed(2)}s`}
            className={`timeline-cue ${selectedId === cue.id ? "selected" : ""}`}
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
        <div className="range-bar">
          {ranges.map((range, i) => (
            <span key={range.id} className="range-chip">
              区间 {i + 1} · {formatRangeTime(range.startMs)}–
              {formatRangeTime(range.endMs)} ·{" "}
              {project.cues.filter((cue) => cueInRanges(cue, [range])).length}{" "}
              条
              <button
                aria-label={`删除区间 ${i + 1}`}
                onClick={() => vm.removeRange(range.id)}
              >
                ×
              </button>
            </span>
          ))}
          <button className="range-clear" onClick={() => vm.clearRanges()}>
            清除选区
          </button>
        </div>
      )}
      <div className="timeline-hint">
        拖动时间块调整起止位置 · 点击条目进行编辑 ·
        在轨道空白处横向拖动可框选检查区间（条目按开始时间归属区间）
      </div>
    </section>
  );
}
