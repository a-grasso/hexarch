/**
 * The layout engine: {@link Architecture} + UI state -> positioned geometry.
 *
 * Owns every visual decision (placement, spacing, docking, arrow endpoints).
 * Pure and deterministic given the measured text widths, so the same function
 * drives the interactive viewer and the headless static export.
 *
 * Convention (classic Ports & Adapters, left-to-right flow):
 *   actors | driving adapters | inbound ports ][ CORE ][ outbound ports | driven adapters
 * Ports dock onto the hexagon's vertical edges so they read as the boundary.
 */
import {
  type Actor,
  type Adapter,
  type Architecture,
  type Port,
} from "@core/model";
import { measureText } from "./measure";

const PORT_H = 42;
const PORT_PITCH = 60;
const ADAPTER_H = 54;
const ADAPTER_PITCH = 72;
const ACTOR_H = 46;
const ACTOR_PITCH = 74;
const COL_GAP = 88;
const MARGIN = 34;
const PORT_OVERLAP = 12;
const CHIP_H = 26;
const CHIP_ROW_PITCH = 34;
const CHIP_GAP_X = 10;
const CAP_RATIO = 0.3;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Pt {
  x: number;
  y: number;
}
export interface PortLayout {
  port: Port;
  box: Box;
}
export interface AdapterLayout {
  adapter: Adapter;
  box: Box;
}
export interface ActorLayout {
  actor: Actor;
  box: Box;
}
export interface Chip {
  text: string;
  kind: "domain" | "service";
  x: number;
  y: number;
  w: number;
}
export interface Section {
  key: "domain" | "application";
  label: string;
  labelPt: Pt;
  collapsed: boolean;
  count: number;
  chips: Chip[];
}
export interface Connector {
  id: string;
  from: Pt;
  to: Pt;
  side: "driving" | "driven";
  /** Stable node ids at each end, e.g. "adapter:REST API", "port:OrderCommand". */
  aId: string;
  bId: string;
}
export interface Hexagon {
  cx: number;
  cy: number;
  points: string;
}
export interface Layout {
  width: number;
  height: number;
  hex: Hexagon;
  coreLabel: Pt;
  sections: Section[];
  inbound: PortLayout[];
  outbound: PortLayout[];
  primary: AdapterLayout[];
  secondary: AdapterLayout[];
  actors: ActorLayout[];
  connectors: Connector[];
}

export interface LayoutOptions {
  collapsed?: Set<string>; // "domain" | "application"
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function chipWidth(text: string): number {
  return Math.max(56, measureText(text, { size: 12.5, weight: 600 }) + 24);
}

function columnWidth(
  labels: Array<{ text: string; size: number; weight: number }>,
  lo: number,
  hi: number,
  fallback: number,
): number {
  if (labels.length === 0) return fallback;
  const widest = Math.max(
    ...labels.map((l) => measureText(l.text, { size: l.size, weight: l.weight })),
  );
  return clamp(widest + 30, lo, hi);
}

function packRows(chips: Chip[], innerW: number): Chip[][] {
  const rows: Chip[][] = [];
  let row: Chip[] = [];
  let used = 0;
  for (const chip of chips) {
    const add = chip.w + (row.length ? CHIP_GAP_X : 0);
    if (row.length && used + add > innerW) {
      rows.push(row);
      row = [];
      used = 0;
    }
    row.push(chip);
    used += chip.w + (row.length > 1 ? CHIP_GAP_X : 0);
  }
  if (row.length) rows.push(row);
  return rows;
}

function railBoxes<T>(
  items: T[],
  cx: number,
  cy: number,
  pitch: number,
  w: number,
  h: number,
): Array<{ item: T; box: Box }> {
  const total = items.length * pitch;
  const start = cy - total / 2 + pitch / 2;
  return items.map((item, i) => ({
    item,
    box: { x: cx - w / 2, y: start + i * pitch - h / 2, w, h },
  }));
}

/** Order adapters so their connectors track the ports they serve. */
function orderAdapters(adapters: Adapter[], portOrder: Map<string, number>) {
  return [...adapters].sort((a, b) => key(a) - key(b));
  function key(a: Adapter) {
    const idx = a.implements
      .map((p) => portOrder.get(p))
      .filter((n): n is number => n != null);
    return idx.length ? idx.reduce((s, n) => s + n, 0) / idx.length : 0;
  }
}

export function computeLayout(arch: Architecture, opts: LayoutOptions = {}): Layout {
  const collapsed = opts.collapsed ?? new Set<string>();

  const hasActors = arch.actors.length > 0;
  const hasPrimary = arch.primary.length > 0;
  const hasInbound = arch.inbound.length > 0;
  const hasOutbound = arch.outbound.length > 0;
  const hasSecondary = arch.secondary.length > 0;

  // --- column widths from measured text -------------------------------
  const portW = columnWidth(
    [
      ...[...arch.inbound, ...arch.outbound].map((p) => ({
        text: p.name,
        size: 13,
        weight: 700,
      })),
      ...[...arch.inbound, ...arch.outbound]
        .filter((p) => p.type)
        .map((p) => ({ text: p.type!, size: 11, weight: 400 })),
    ],
    120,
    230,
    150,
  );
  const adapterW = columnWidth(
    [
      ...[...arch.primary, ...arch.secondary].map((a) => ({
        text: a.name,
        size: 13,
        weight: 650,
      })),
      ...[...arch.primary, ...arch.secondary]
        .filter((a) => a.technology)
        .map((a) => ({ text: a.technology!, size: 11, weight: 400 })),
    ],
    150,
    250,
    180,
  );
  const actorW = columnWidth(
    arch.actors.map((a) => ({ text: a.name, size: 13, weight: 650 })),
    110,
    200,
    130,
  );

  // --- core content sizing --------------------------------------------
  const domainChips: Chip[] = arch.core.domain.map((t) => ({
    text: t,
    kind: "domain",
    x: 0,
    y: 0,
    w: chipWidth(t),
  }));
  const serviceChips: Chip[] = arch.core.services.map((t) => ({
    text: t,
    kind: "service",
    x: 0,
    y: 0,
    w: chipWidth(t),
  }));

  const widestChip = Math.max(
    0,
    ...domainChips.map((c) => c.w),
    ...serviceChips.map((c) => c.w),
  );
  const totalDomain =
    domainChips.reduce((s, c) => s + c.w, 0) +
    CHIP_GAP_X * Math.max(0, domainChips.length - 1);
  const innerW = clamp(Math.max(240, widestChip + 24, totalDomain + 8), 240, 440);

  const domCollapsed = collapsed.has("domain");
  const appCollapsed = collapsed.has("application");
  const domRows =
    domainChips.length && !domCollapsed ? packRows(domainChips, innerW) : [];
  const svcRows =
    serviceChips.length && !appCollapsed ? packRows(serviceChips, innerW) : [];

  let contentH = 30; // CORE label
  if (arch.core.domain.length) contentH += 20 + CHIP_ROW_PITCH * domRows.length;
  if (arch.core.services.length)
    contentH +=
      (arch.core.domain.length ? 12 : 0) + 20 + CHIP_ROW_PITCH * svcRows.length;

  // --- hexagon size ----------------------------------------------------
  const HW = Math.max(innerW / 2 + 26, 150);
  const maxSpan = Math.max(
    arch.inbound.length * PORT_PITCH,
    arch.outbound.length * PORT_PITCH,
  );
  const e = Math.max(maxSpan / 2 + 16, contentH / 2 + 16, 66);
  const cap = HW * CAP_RATIO;
  const HH = e + cap;

  // --- horizontal placement -------------------------------------------
  const actorSpace = hasActors ? actorW + COL_GAP : 0;
  const primarySpace = hasPrimary ? adapterW + COL_GAP : 0;
  const inboundSpace = hasInbound ? portW : 0;
  const hexLeftX = MARGIN + actorSpace + primarySpace + inboundSpace;
  const cx = hexLeftX + HW;
  const hexRightX = cx + HW;
  const outboundSpace = hasOutbound ? portW : 0;
  const secondarySpace = hasSecondary ? adapterW + COL_GAP : 0;
  const width = hexRightX + outboundSpace + secondarySpace + MARGIN;

  // --- vertical placement ---------------------------------------------
  const bodyH = Math.max(
    2 * HH,
    arch.primary.length * ADAPTER_PITCH,
    arch.secondary.length * ADAPTER_PITCH,
    arch.actors.length * ACTOR_PITCH,
  );
  const height = bodyH + 2 * MARGIN;
  const cy = MARGIN + bodyH / 2;

  // --- ordered rails ---------------------------------------------------
  const inOrder = new Map(arch.inbound.map((p, i) => [p.name, i]));
  const outOrder = new Map(arch.outbound.map((p, i) => [p.name, i]));
  const primary = orderAdapters(arch.primary, inOrder);
  const secondary = orderAdapters(arch.secondary, outOrder);

  // Order actors to follow the vertical position of the adapters they drive,
  // so their connectors don't cross.
  const primaryPos = new Map(primary.map((a, i) => [a.name, i]));
  const actorsOrdered = [...arch.actors].sort((x, y) => {
    const k = (ac: Actor) => {
      const idx = ac.drives
        .map((d) => primaryPos.get(d))
        .filter((n): n is number => n != null);
      return idx.length ? idx.reduce((s, n) => s + n, 0) / idx.length : 0;
    };
    return k(x) - k(y);
  });

  const inbound: PortLayout[] = railBoxes(
    arch.inbound,
    hexLeftX - portW / 2 + PORT_OVERLAP,
    cy,
    PORT_PITCH,
    portW,
    PORT_H,
  ).map(({ item, box }) => ({ port: item, box }));
  const outbound: PortLayout[] = railBoxes(
    arch.outbound,
    hexRightX + portW / 2 - PORT_OVERLAP,
    cy,
    PORT_PITCH,
    portW,
    PORT_H,
  ).map(({ item, box }) => ({ port: item, box }));

  const primaryX = MARGIN + actorSpace + adapterW / 2;
  const secondaryX = hexRightX + outboundSpace + COL_GAP + adapterW / 2;
  const primaryBoxes: AdapterLayout[] = railBoxes(
    primary,
    primaryX,
    cy,
    ADAPTER_PITCH,
    adapterW,
    ADAPTER_H,
  ).map(({ item, box }) => ({ adapter: item, box }));
  const secondaryBoxes: AdapterLayout[] = railBoxes(
    secondary,
    secondaryX,
    cy,
    ADAPTER_PITCH,
    adapterW,
    ADAPTER_H,
  ).map(({ item, box }) => ({ adapter: item, box }));

  const actorX = MARGIN + actorW / 2;
  const actorBoxes: ActorLayout[] = railBoxes(
    actorsOrdered,
    actorX,
    cy,
    ACTOR_PITCH,
    actorW,
    ACTOR_H,
  ).map(({ item, box }) => ({ actor: item, box }));

  // --- core content placement -----------------------------------------
  const sections: Section[] = [];
  let blockH = 30;
  if (arch.core.domain.length) blockH += 20 + CHIP_ROW_PITCH * domRows.length;
  if (arch.core.services.length)
    blockH +=
      (arch.core.domain.length ? 12 : 0) + 20 + CHIP_ROW_PITCH * svcRows.length;

  let y = cy - blockH / 2 + 9;
  const coreLabel: Pt = { x: cx, y };
  y += 28;

  const emit = (
    key: "domain" | "application",
    label: string,
    rows: Chip[][],
    count: number,
    isCollapsed: boolean,
  ) => {
    const labelPt: Pt = { x: cx, y };
    y += 20;
    const chips: Chip[] = [];
    for (const row of rows) {
      const total =
        row.reduce((s, c) => s + c.w, 0) + CHIP_GAP_X * (row.length - 1);
      let rx = cx - total / 2;
      for (const chip of row) {
        chips.push({ ...chip, x: rx, y: y - CHIP_H + 7 });
        rx += chip.w + CHIP_GAP_X;
      }
      y += CHIP_ROW_PITCH;
    }
    sections.push({ key, label, labelPt, collapsed: isCollapsed, count, chips });
  };

  if (arch.core.domain.length)
    emit("domain", "Domain", domRows, arch.core.domain.length, domCollapsed);
  if (arch.core.services.length) {
    if (arch.core.domain.length) y += 12;
    emit(
      "application",
      "Application",
      svcRows,
      arch.core.services.length,
      appCollapsed,
    );
  }

  // --- connectors ------------------------------------------------------
  const connectors: Connector[] = [];
  const adapterBox = new Map<string, Box>();
  for (const a of primaryBoxes) adapterBox.set(a.adapter.name, a.box);
  const portBox = new Map<string, Box>();
  for (const p of [...inbound, ...outbound]) portBox.set(p.port.name, p.box);

  for (const a of primaryBoxes) {
    for (const t of a.adapter.implements) {
      const pb = portBox.get(t);
      if (!pb) continue;
      connectors.push({
        id: `p:${a.adapter.name}->${t}`,
        from: { x: a.box.x + a.box.w, y: a.box.y + a.box.h / 2 },
        to: { x: pb.x, y: pb.y + pb.h / 2 },
        side: "driving",
        aId: `adapter:${a.adapter.name}`,
        bId: `port:${t}`,
      });
    }
  }
  for (const a of secondaryBoxes) {
    for (const t of a.adapter.implements) {
      const pb = portBox.get(t);
      if (!pb) continue;
      connectors.push({
        id: `s:${a.adapter.name}->${t}`,
        from: { x: pb.x + pb.w, y: pb.y + pb.h / 2 },
        to: { x: a.box.x, y: a.box.y + a.box.h / 2 },
        side: "driven",
        aId: `port:${t}`,
        bId: `adapter:${a.adapter.name}`,
      });
    }
  }
  for (const ac of actorBoxes) {
    for (const t of ac.actor.drives) {
      const ab = adapterBox.get(t);
      if (!ab) continue;
      connectors.push({
        id: `a:${ac.actor.name}->${t}`,
        from: { x: ac.box.x + ac.box.w, y: ac.box.y + ac.box.h / 2 },
        to: { x: ab.x, y: ab.y + ab.h / 2 },
        side: "driving",
        aId: `actor:${ac.actor.name}`,
        bId: `adapter:${t}`,
      });
    }
  }

  // --- hexagon points --------------------------------------------------
  const pts: Pt[] = [
    { x: cx, y: cy - HH },
    { x: cx + HW, y: cy - e },
    { x: cx + HW, y: cy + e },
    { x: cx, y: cy + HH },
    { x: cx - HW, y: cy + e },
    { x: cx - HW, y: cy - e },
  ];
  const points = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  return {
    width,
    height,
    hex: { cx, cy, points },
    coreLabel,
    sections,
    inbound,
    outbound,
    primary: primaryBoxes,
    secondary: secondaryBoxes,
    actors: actorBoxes,
    connectors,
  };
}
