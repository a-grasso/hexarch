/**
 * The hexarch DSL - semantic model.
 *
 * These types describe *what the architecture is* in Ports & Adapters terms.
 * They carry no geometry, colours or sizes: placement and styling are the
 * renderer's job. This separation is the point of the DSL - you describe
 * intent, the viewer decides how to draw it.
 */

export type Side = "driving" | "driven";

/** Semantic hint that steers a port's glyph/colour. Not a closed set. */
export const KNOWN_PORT_TYPES = [
  "command",
  "query",
  "event",
  "persistence",
  "external-service",
  "messaging",
  "notification",
] as const;
export type PortType = (typeof KNOWN_PORT_TYPES)[number] | (string & {});

export interface Port {
  name: string;
  side: Side;
  type?: string;
  /** Use-case operations the port exposes (inbound) or requires (outbound). */
  operations: string[];
  description?: string;
}

export interface Adapter {
  name: string;
  side: Side;
  technology?: string;
  /** Names of the ports this adapter plugs into. */
  implements: string[];
  description?: string;
}

/** An external driver of the system (user, system, scheduler, ...). Optional. */
export interface Actor {
  name: string;
  /** Names of primary adapters this actor drives. */
  drives: string[];
  description?: string;
}

export interface Core {
  domain: string[];
  services: string[];
}

export interface Architecture {
  name: string;
  description?: string;
  core: Core;
  inbound: Port[];
  outbound: Port[];
  primary: Adapter[];
  secondary: Adapter[];
  actors: Actor[];
}

export function findPort(arch: Architecture, name: string): Port | undefined {
  return [...arch.inbound, ...arch.outbound].find((p) => p.name === name);
}

export function allPorts(arch: Architecture): Port[] {
  return [...arch.inbound, ...arch.outbound];
}

export function allAdapters(arch: Architecture): Adapter[] {
  return [...arch.primary, ...arch.secondary];
}
