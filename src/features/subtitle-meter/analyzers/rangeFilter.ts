import type { SubtitleCue, SubtitleIssue, TimeRange } from "../models";
// 归属规则：条目按开始时间归属区间，区间左闭右开 [startMs, endMs)。
// 跨越区间边界的条目只按开始时间归属一个区间；问题跟随其所属条目。
// 区间集中的重叠与相接部分会被合并，因此每个条目最多归属一个区间。
export function mergeRanges(ranges: TimeRange[]): TimeRange[] {
  const sorted = [...ranges].sort((a, b) => a.startMs - b.startMs);
  const merged: TimeRange[] = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last && range.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, range.endMs);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}
export function cueInRanges(cue: SubtitleCue, ranges: TimeRange[]): boolean {
  return ranges.some(
    (range) => cue.startMs >= range.startMs && cue.startMs < range.endMs,
  );
}
export function filterCuesByRanges(
  cues: SubtitleCue[],
  ranges: TimeRange[],
): SubtitleCue[] {
  if (!ranges.length) return cues;
  return cues.filter((cue) => cueInRanges(cue, ranges));
}
export function filterIssuesByRanges(
  issues: SubtitleIssue[],
  cues: SubtitleCue[],
  ranges: TimeRange[],
): SubtitleIssue[] {
  if (!ranges.length) return issues;
  const scoped = new Set(filterCuesByRanges(cues, ranges).map((cue) => cue.id));
  return issues.filter((issue) => scoped.has(issue.cueId));
}
