import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Architecture, Port } from "@core/model";
import { computeLayout, type Connector, type Layout } from "../layout/layout";
import { measureText } from "../layout/measure";

interface Props {
  arch: Architecture;
  collapsed: Set<string>;
  onToggleSection: (key: string) => void;
}

interface Transform {
  s: number;
  tx: number;
  ty: number;
}

const FIT_PAD = 40;

export function Diagram({ arch, collapsed, onToggleSection }: Props) {
  const layout = useMemo(
    () => computeLayout(arch, { collapsed }),
    [arch, collapsed],
  );

  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tf, setTf] = useState<Transform>({ s: 1, tx: 0, ty: 0 });
  const [grabbing, setGrabbing] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [hoverPort, setHoverPort] = useState<Port | null>(null);
  const fittedRef = useRef<Architecture | null>(null);

  // Track container size.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = (l: Layout, sz: { w: number; h: number }) => {
    if (!sz.w || !sz.h) return;
    const s = Math.min(
      (sz.w - 2 * FIT_PAD) / l.width,
      (sz.h - 2 * FIT_PAD) / l.height,
      1.6,
    );
    setTf({
      s,
      tx: (sz.w - l.width * s) / 2,
      ty: (sz.h - l.height * s) / 2,
    });
  };

  // Fit when the spec (arch identity) changes or size first becomes available.
  useLayoutEffect(() => {
    if (!size.w || !size.h) return;
    if (fittedRef.current === arch) return;
    fittedRef.current = arch;
    fit(layout, size);
  }, [arch, layout, size]);

  // --- pan & zoom ------------------------------------------------------
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = stageRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setTf((t) => {
      const s = Math.max(0.15, Math.min(5, t.s * factor));
      const k = s / t.s;
      return { s, tx: cx - (cx - t.tx) * k, ty: cy - (cy - t.ty) * k };
    });
  };

  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(
    null,
  );
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, tx: tf.tx, ty: tf.ty };
    setGrabbing(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setTf((t) => ({
      ...t,
      tx: drag.current!.tx + (e.clientX - drag.current!.x),
      ty: drag.current!.ty + (e.clientY - drag.current!.y),
    }));
  };
  const endDrag = () => {
    drag.current = null;
    setGrabbing(false);
  };

  const zoomBy = (factor: number) =>
    setTf((t) => {
      const s = Math.max(0.15, Math.min(5, t.s * factor));
      const k = s / t.s;
      const cx = size.w / 2;
      const cy = size.h / 2;
      return { s, tx: cx - (cx - t.tx) * k, ty: cy - (cy - t.ty) * k };
    });

  // --- focus / dimming -------------------------------------------------
  const neighbors = useMemo(() => {
    if (!focus) return null;
    const set = new Set<string>([focus]);
    for (const c of layout.connectors) {
      if (c.aId === focus) set.add(c.bId);
      if (c.bId === focus) set.add(c.aId);
    }
    return set;
  }, [focus, layout.connectors]);

  const nodeDim = (id: string) => (neighbors && !neighbors.has(id) ? " dim" : "");
  const connDim = (c: Connector) =>
    focus
      ? c.aId === focus || c.bId === focus
        ? ` hot ${c.side}`
        : " dim"
      : "";

  return (
    <div
      ref={stageRef}
      className={"stage" + (grabbing ? " grabbing" : "")}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
    >
      <svg viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 9 5 L 0 9 z" className="arrowhead" />
          </marker>
        </defs>

        <g transform={`translate(${tf.tx},${tf.ty}) scale(${tf.s})`}>
          {/* connectors */}
          {layout.connectors.map((c) => (
            <path
              key={c.id}
              className={"connector" + connDim(c)}
              d={curve(c)}
              markerEnd="url(#arrow)"
            />
          ))}

          {/* hexagon */}
          <polygon className="hex" points={layout.hex.points} />

          {/* core content */}
          <text
            className="core-label"
            x={layout.coreLabel.x}
            y={layout.coreLabel.y}
            textAnchor="middle"
          >
            CORE
          </text>
          {layout.sections.map((sec) => (
            <g key={sec.key}>
              <text
                className="section-label"
                x={sec.labelPt.x}
                y={sec.labelPt.y}
                textAnchor="middle"
                onClick={() => onToggleSection(sec.key)}
              >
                {sec.label}
                {sec.collapsed ? `  +${sec.count}` : ""}
              </text>
              {sec.chips.map((chip, i) => (
                <g key={i}>
                  <rect
                    className={chip.kind === "domain" ? "chip-domain" : "chip-service"}
                    x={chip.x}
                    y={chip.y}
                    width={chip.w}
                    height={26}
                    rx={13}
                  />
                  <text
                    className="chip-text"
                    x={chip.x + chip.w / 2}
                    y={chip.y + 18}
                    textAnchor="middle"
                  >
                    {chip.text}
                  </text>
                </g>
              ))}
            </g>
          ))}

          {/* ports */}
          {[...layout.inbound, ...layout.outbound].map(({ port, box }) => {
            const id = `port:${port.name}`;
            return (
              <g
                key={id}
                className={nodeDim(id)}
                onMouseEnter={() => {
                  setFocus(id);
                  if (port.operations.length || port.description) setHoverPort(port);
                }}
                onMouseLeave={() => {
                  setFocus(null);
                  setHoverPort(null);
                }}
              >
                <rect
                  className={`port ${port.side}`}
                  x={box.x}
                  y={box.y}
                  width={box.w}
                  height={box.h}
                  rx={8}
                />
                {port.type ? (
                  <>
                    <text className="port-name" x={box.x + box.w / 2} y={box.y + 19} textAnchor="middle">
                      {port.name}
                    </text>
                    <text className="port-type" x={box.x + box.w / 2} y={box.y + 34} textAnchor="middle">
                      {port.type}
                    </text>
                  </>
                ) : (
                  <text className="port-name" x={box.x + box.w / 2} y={box.y + box.h / 2 + 4} textAnchor="middle">
                    {port.name}
                  </text>
                )}
                {port.operations.length > 0 && (
                  <text
                    className="port-ops-badge"
                    x={box.x + box.w - 8}
                    y={box.y + 13}
                    textAnchor="end"
                    fill={port.side === "driving" ? "var(--driving)" : "var(--driven)"}
                  >
                    {port.operations.length}▸
                  </text>
                )}
              </g>
            );
          })}

          {/* adapters */}
          {[...layout.primary, ...layout.secondary].map(({ adapter, box }) => {
            const id = `adapter:${adapter.name}`;
            const stripeX = adapter.side === "driving" ? box.x + box.w - 5 : box.x;
            return (
              <g
                key={id}
                className={nodeDim(id)}
                onMouseEnter={() => setFocus(id)}
                onMouseLeave={() => setFocus(null)}
              >
                <rect className="adapter" x={box.x} y={box.y} width={box.w} height={box.h} rx={10} />
                <rect className={`stripe ${adapter.side}`} x={stripeX} y={box.y} width={5} height={box.h} />
                {adapter.technology ? (
                  <>
                    <text className="adapter-name" x={box.x + box.w / 2} y={box.y + 23} textAnchor="middle">
                      {adapter.name}
                    </text>
                    <text className="adapter-tech" x={box.x + box.w / 2} y={box.y + 40} textAnchor="middle">
                      {adapter.technology}
                    </text>
                  </>
                ) : (
                  <text className="adapter-name" x={box.x + box.w / 2} y={box.y + box.h / 2 + 4} textAnchor="middle">
                    {adapter.name}
                  </text>
                )}
              </g>
            );
          })}

          {/* actors */}
          {layout.actors.map(({ actor, box }) => {
            const id = `actor:${actor.name}`;
            return (
              <g
                key={id}
                className={nodeDim(id)}
                onMouseEnter={() => setFocus(id)}
                onMouseLeave={() => setFocus(null)}
              >
                <rect className="actor" x={box.x} y={box.y} width={box.w} height={box.h} rx={10} />
                <text className="actor-name" x={box.x + box.w / 2} y={box.y + box.h / 2 + 4} textAnchor="middle">
                  {actor.name}
                </text>
              </g>
            );
          })}

          {/* port operations popover */}
          {hoverPort && <Popover port={hoverPort} layout={layout} />}
        </g>
      </svg>

      <div className="zoom-controls">
        <button onClick={() => zoomBy(1.2)} title="Zoom in">+</button>
        <button onClick={() => zoomBy(1 / 1.2)} title="Zoom out">−</button>
        <button onClick={() => fit(layout, size)} title="Fit">⤢</button>
      </div>
    </div>
  );
}

function curve(c: Connector): string {
  const dx = (c.to.x - c.from.x) * 0.5;
  return `M ${c.from.x} ${c.from.y} C ${c.from.x + dx} ${c.from.y}, ${
    c.to.x - dx
  } ${c.to.y}, ${c.to.x} ${c.to.y}`;
}

function Popover({ port, layout }: { port: Port; layout: Layout }) {
  const box = [...layout.inbound, ...layout.outbound].find(
    (p) => p.port.name === port.name,
  )!.box;
  const PAD = 14;

  // Provisional width from the longest single line, then wrap the description.
  const titleW = measureText(port.name, { size: 12.5, weight: 700 });
  const subW = port.type ? measureText(port.type, { size: 10.5 }) : 0;
  const opW = port.operations.length
    ? Math.max(...port.operations.map((o) => measureText(o, { size: 11.5 }))) + 14
    : 0;
  const w = Math.round(
    Math.min(320, Math.max(150, titleW, subW, opW, 170) + PAD * 2),
  );
  const descLines = port.description ? wrap(port.description, w - PAD * 2, 11) : [];

  // Build rows top-down with explicit y positions.
  type Row =
    | { kind: "title"; y: number; text: string }
    | { kind: "sub"; y: number; text: string }
    | { kind: "op"; y: number; text: string };
  const rows: Row[] = [];
  let y = 22;
  rows.push({ kind: "title", y, text: port.name });
  if (port.type) {
    y += 16;
    rows.push({ kind: "sub", y, text: port.type });
  }
  for (const ln of descLines) {
    y += 15;
    rows.push({ kind: "sub", y, text: ln });
  }
  if (port.operations.length) {
    y += 6;
    for (const op of port.operations) {
      y += 18;
      rows.push({ kind: "op", y, text: op });
    }
  }
  const h = y + 12;

  const x = port.side === "driving" ? box.x - w - 12 : box.x + box.w + 12;
  const top = box.y + box.h / 2 - h / 2;

  return (
    <g transform={`translate(${x},${top})`} pointerEvents="none">
      <rect className="popover-box" x={0} y={0} width={w} height={h} rx={10} />
      {rows.map((r, i) =>
        r.kind === "op" ? (
          <g key={i}>
            <circle className="popover-op-bullet" cx={PAD + 3} cy={r.y - 4} r={2} />
            <text className="popover-op" x={PAD + 12} y={r.y}>
              {r.text}
            </text>
          </g>
        ) : (
          <text
            key={i}
            className={r.kind === "title" ? "popover-title" : "popover-sub"}
            x={PAD}
            y={r.y}
          >
            {r.text}
          </text>
        ),
      )}
    </g>
  );
}

function wrap(text: string, maxW: number, size: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const trial = line ? line + " " + word : word;
    if (line && measureText(trial, { size }) > maxW) {
      lines.push(line);
      line = word;
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  return lines;
}
