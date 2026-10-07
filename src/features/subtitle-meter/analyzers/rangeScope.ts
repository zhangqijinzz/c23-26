import type { SubtitleCue, SubtitleIssue, TimeRange } from "../models";
// 归属规则：条目与区间有时间交叠即归属该区间（贴边不算，与重叠检测语义一致）；
// 跨区间条目同时计入每个相交区间。ranges 为空表示未限定范围，即全片。
export const cueInRange = (cue: SubtitleCue, range: TimeRange): boolean =>
  cue.startMs < range.endMs && cue.endMs > range.startMs;
export const cuesInRanges = (
  cues: SubtitleCue[],
  ranges: TimeRange[],
): SubtitleCue[] =>
  ranges.length
    ? cues.filter((cue) => ranges.some((range) => cueInRange(cue, range)))
    : cues;
export const issuesInRanges = (
  issues: SubtitleIssue[],
  cues: SubtitleCue[],
  ranges: TimeRange[],
): SubtitleIssue[] => {
  if (!ranges.length) return issues;
  const scoped = new Set(cuesInRanges(cues, ranges).map((cue) => cue.id));
  return issues.filter((issue) => scoped.has(issue.cueId));
};
export const rangeStats = (
  cues: SubtitleCue[],
  issues: SubtitleIssue[],
  range: TimeRange,
): { cueCount: number; issueCount: number } => {
  const scoped = new Set(
    cues.filter((cue) => cueInRange(cue, range)).map((cue) => cue.id),
  );
  return {
    cueCount: scoped.size,
    issueCount: issues.filter((issue) => scoped.has(issue.cueId)).length,
  };
};
