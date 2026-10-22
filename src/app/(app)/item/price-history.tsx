"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState, type PointerEvent } from "react";
import type { HistoryLine, PriceHistory } from "@/core";
import { Empty, inputClass, List, Section, useCoreData } from "../ui";
import { useMoney } from "./money";
import { useRecorderName } from "./recorder";

/** Lines get the first eight chart colors in order; any more share a neutral gray. */
const lineColor = (line: HistoryLine) => (line.order < 8 ? `var(--series-${line.order + 1})` : "var(--series-other)");

/** Entries shown before "Tampilkan semua". */
const FIRST_ENTRIES = 15;

/**
 * How an item's price has moved in the active region: a chart per store and
 * the list of every recorded price, optionally for one store only. `version`
 * changes when prices are recorded or removed, to reload.
 */
export function PriceHistorySection({ itemId, version }: { itemId: string; version: unknown }) {
  const t = useTranslations("History");
  const [storeId, setStoreId] = useState("");
  const [history] = useCoreData((core) => core.priceHistory(itemId, { storeId: storeId || undefined }), [itemId, storeId, version]);
  if (!history || history.stores.length === 0) return null;

  return (
    <Section title={t("title")}>
      {history.stores.length > 1 && (
        <select aria-label={t("store")} value={storeId} onChange={(e) => setStoreId(e.target.value)} className={inputClass}>
          <option value="">{t("allStores")}</option>
          {history.stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
      {history.entries.length === 0 ? (
        <Empty>{t("empty")}</Empty>
      ) : (
        <>
          <HistoryChart history={history} />
          <HistoryList key={storeId} history={history} />
        </>
      )}
    </Section>
  );
}

const W = 360;
const H = 200;
const M = { top: 16, end: 12, bottom: 24, start: 64 };

/** Step lines (a price holds until the next one), a dot per recorded price, and the 90-day low. */
function HistoryChart({ history }: { history: PriceHistory }) {
  const t = useTranslations("History");
  const money = useMoney(history.region);
  const format = useFormatter();
  const [hover, setHover] = useState<{ line: HistoryLine; point: HistoryLine["points"][number]; x: number; y: number } | null>(null);

  const scale = useMemo(() => {
    const points = history.lines.flatMap((l) => l.points);
    const times = points.map((p) => new Date(p.observedAt).getTime());
    const t0 = Math.min(...times);
    const t1 = Math.max(new Date(history.asOf).getTime(), ...times);
    const values = points.map((p) => p.paid);
    // Round gridlines (1, 2, 2.5 or 5 × a power of ten) with some room above and below.
    const min = Math.min(...values);
    const max = Math.max(...values);
    const raw = Math.max((max - min) / 2, max * 0.05, 1);
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((f) => f * magnitude).find((s) => s >= raw)!;
    const lo = Math.max(0, Math.floor((min - step / 4) / step) * step);
    const hi = Math.ceil((max + step / 4) / step) * step;
    const ticks: number[] = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);
    const x = (time: number) => M.start + (t1 === t0 ? (W - M.start - M.end) / 2 : ((time - t0) / (t1 - t0)) * (W - M.start - M.end));
    const y = (value: number) => M.top + (1 - (value - lo) / (hi - lo)) * (H - M.top - M.bottom);
    return { x, y, t0, t1, ticks, end: x(t1) };
  }, [history]);

  const day = (time: number | string) => format.dateTime(new Date(time), { day: "numeric", month: "short" });

  const path = (line: HistoryLine) => {
    const [first, ...rest] = line.points;
    let d = `M${scale.x(new Date(first.observedAt).getTime())},${scale.y(first.paid)}`;
    for (const p of rest) d += `H${scale.x(new Date(p.observedAt).getTime())}V${scale.y(p.paid)}`;
    return `${d}H${scale.end}`;
  };

  function onPointer(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * W;
    const py = ((event.clientY - rect.top) / rect.height) * H;
    let best: typeof hover = null;
    let bestDistance = Infinity;
    for (const line of history.lines) {
      for (const point of line.points) {
        const x = scale.x(new Date(point.observedAt).getTime());
        const y = scale.y(point.paid);
        const distance = Math.hypot(x - px, (y - py) * 0.5);
        if (distance < bestDistance) [best, bestDistance] = [{ line, point, x, y }, distance];
      }
    }
    setHover(best);
  }

  const lowY = history.lowest90Days !== null ? scale.y(history.lowest90Days) : null;

  return (
    <figure className="viz-root relative m-0 flex flex-col gap-2">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full touch-none select-none"
          role="img"
          aria-label={t("chartLabel")}
          onPointerMove={onPointer}
          onPointerDown={onPointer}
          onPointerLeave={() => setHover(null)}
        >
          {scale.ticks.map((v) => (
            <g key={v}>
              <line x1={M.start} x2={W - M.end} y1={scale.y(v)} y2={scale.y(v)} stroke="var(--viz-grid)" strokeWidth={1} />
              <text x={M.start - 6} y={scale.y(v)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--viz-text)" className="tabular-nums">
                {money(v)}
              </text>
            </g>
          ))}
          <text x={M.start} y={H - 6} fontSize={10} fill="var(--viz-text)">
            {day(scale.t0)}
          </text>
          <text x={W - M.end} y={H - 6} fontSize={10} textAnchor="end" fill="var(--viz-text)">
            {t("today")}
          </text>
          {lowY !== null && (
            <g>
              <line x1={M.start} x2={W - M.end} y1={lowY} y2={lowY} stroke="var(--viz-text)" strokeWidth={1} strokeOpacity={0.7} />
              <text x={W - M.end} y={lowY - 4} fontSize={10} textAnchor="end" fill="var(--viz-text)">
                {t("lowest", { price: money(history.lowest90Days!) })}
              </text>
            </g>
          )}
          {hover && <line x1={hover.x} x2={hover.x} y1={M.top} y2={H - M.bottom} stroke="var(--viz-text)" strokeWidth={1} strokeOpacity={0.5} />}
          {history.lines.map((line) => (
            <g key={line.key}>
              <path d={path(line)} fill="none" stroke={lineColor(line)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {line.points.map((p) => (
                <circle
                  key={p.observationId}
                  cx={scale.x(new Date(p.observedAt).getTime())}
                  cy={scale.y(p.paid)}
                  r={hover?.point === p ? 6 : 4}
                  fill={lineColor(line)}
                  stroke="var(--viz-surface)"
                  strokeWidth={2}
                />
              ))}
            </g>
          ))}
        </svg>
        {hover && (
          <div
            role="status"
            className="pointer-events-none absolute z-10 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs shadow dark:border-neutral-800 dark:bg-neutral-900"
            style={{
              insetInlineStart: `${Math.min((hover.x / W) * 100, 62)}%`,
              top: `${Math.max((hover.y / H) * 100 - 28, 0)}%`,
            }}
          >
            <div className="flex items-center gap-1 font-medium">
              <span aria-hidden className="inline-block h-0.5 w-3 rounded" style={{ background: lineColor(hover.line) }} />
              {hover.line.name}
            </div>
            <div className="tabular-nums">
              {money(hover.point.paid)} · {day(hover.point.observedAt)}
            </div>
          </div>
        )}
      </div>
      {history.lines.length > 1 && (
        <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {history.lines.map((line) => (
            <span key={line.key} className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-0.5 w-4 rounded" style={{ background: lineColor(line) }} />
              {line.name}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}

/** Every recorded price, newest first: the chart's data as text. */
function HistoryList({ history }: { history: PriceHistory }) {
  const t = useTranslations();
  const money = useMoney(history.region);
  const format = useFormatter();
  const [all, setAll] = useState(false);
  const recorderName = useRecorderName();
  const shown = all ? history.entries : history.entries.slice(0, FIRST_ENTRIES);

  return (
    <>
      <List>
        {shown.map(({ observation: o, store, chain, paid, recordedBy }) => (
          <li key={o.id} className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{chain ? t("PriceDetails.wholeChain", { chain: chain.name }) : store.name}</span>
              <span className="text-sm opacity-60">
                {format.dateTime(new Date(o.observedAt), { day: "numeric", month: "short", year: "numeric" })} ·{" "}
                {t(`PriceDetails.action_${o.action}`)}
                {chain && ` · ${store.name}`}
                {recordedBy && ` · ${recorderName(recordedBy)}`}
              </span>
              {o.note && <span className="text-sm italic opacity-70">{o.note}</span>}
            </div>
            <div className="shrink-0 text-end">
              <div className="font-semibold tabular-nums">{money(paid, o.priceMax)}</div>
              {paid !== o.price && <s className="text-xs opacity-60">{money(o.price)}</s>}
            </div>
          </li>
        ))}
      </List>
      {!all && history.entries.length > FIRST_ENTRIES && (
        <button type="button" onClick={() => setAll(true)} className="text-sm font-semibold text-green-700 dark:text-green-500">
          {t("History.showAll", { count: history.entries.length })}
        </button>
      )}
    </>
  );
}
