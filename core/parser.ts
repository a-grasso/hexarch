/**
 * Parse the hexarch YAML DSL into the semantic {@link Architecture} model.
 *
 * Forgiving where it can be (missing optional sections default to empty; a bare
 * string is accepted as a port/entity name), strict where it must be (structural
 * mistakes and dangling references raise {@link ParseError} pointing at the spot).
 */
import yaml from "js-yaml";
import {
  type Adapter,
  type Actor,
  type Architecture,
  type Port,
  type Side,
} from "./model";

export class ParseError extends Error {}

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function asList(value: unknown, where: string): unknown[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (["string", "number", "boolean"].includes(typeof value)) return [value];
  throw new ParseError(`${where}: expected a list, got ${typeof value}`);
}

function strList(value: unknown, where: string): string[] {
  return asList(value, where).map((v) => String(v));
}

function str(v: unknown): string | undefined {
  return v == null || v === "" ? undefined : String(v);
}

function parsePort(raw: unknown, side: Side, i: number): Port {
  const where = `ports.${side === "driving" ? "inbound" : "outbound"}[${i}]`;
  if (typeof raw === "string") return { name: raw, side, operations: [] };
  if (!isObj(raw)) throw new ParseError(`${where}: expected a name or a mapping`);
  if (raw.name == null) throw new ParseError(`${where}: missing required key 'name'`);
  return {
    name: String(raw.name),
    side,
    type: str(raw.type),
    operations: strList(raw.operations, `${where}.operations`),
    description: str(raw.description),
  };
}

function parseAdapter(raw: unknown, side: Side, i: number): Adapter {
  const kind = side === "driving" ? "primary" : "secondary";
  const where = `adapters.${kind}[${i}]`;
  if (!isObj(raw)) throw new ParseError(`${where}: expected a mapping`);
  if (raw.name == null) throw new ParseError(`${where}: missing required key 'name'`);
  return {
    name: String(raw.name),
    side,
    technology: str(raw.technology),
    implements: strList(raw.implements, `${where}.implements`),
    description: str(raw.description),
  };
}

function parseActor(raw: unknown, i: number): Actor {
  const where = `actors[${i}]`;
  if (typeof raw === "string") return { name: raw, drives: [] };
  if (!isObj(raw)) throw new ParseError(`${where}: expected a name or a mapping`);
  if (raw.name == null) throw new ParseError(`${where}: missing required key 'name'`);
  return {
    name: String(raw.name),
    drives: strList(raw.drives, `${where}.drives`),
    description: str(raw.description),
  };
}

export function parse(text: string): Architecture {
  let doc: unknown;
  try {
    doc = yaml.load(text);
  } catch (e) {
    throw new ParseError(`invalid YAML: ${(e as Error).message}`);
  }
  if (!isObj(doc)) throw new ParseError("top level must be a mapping");

  const meta = doc.architecture ?? {};
  if (!isObj(meta)) throw new ParseError("'architecture' must be a mapping");

  const coreRaw = isObj(doc.core) ? doc.core : {};
  const appRaw = isObj(coreRaw.application) ? coreRaw.application : {};

  const portsRaw = isObj(doc.ports) ? doc.ports : {};
  const inbound = asList(portsRaw.inbound, "ports.inbound").map((p, i) =>
    parsePort(p, "driving", i),
  );
  const outbound = asList(portsRaw.outbound, "ports.outbound").map((p, i) =>
    parsePort(p, "driven", i),
  );

  const adaptersRaw = isObj(doc.adapters) ? doc.adapters : {};
  const primary = asList(adaptersRaw.primary, "adapters.primary").map((a, i) =>
    parseAdapter(a, "driving", i),
  );
  const secondary = asList(adaptersRaw.secondary, "adapters.secondary").map(
    (a, i) => parseAdapter(a, "driven", i),
  );

  const actors = asList(doc.actors, "actors").map((a, i) => parseActor(a, i));

  const arch: Architecture = {
    name: String(meta.name ?? "Untitled Architecture"),
    description: str(meta.description),
    core: {
      domain: strList(coreRaw.domain, "core.domain"),
      services: strList(appRaw.services, "core.application.services"),
    },
    inbound,
    outbound,
    primary,
    secondary,
    actors,
  };
  validate(arch);
  return arch;
}

function validate(arch: Architecture): void {
  const inboundNames = new Set(arch.inbound.map((p) => p.name));
  const outboundNames = new Set(arch.outbound.map((p) => p.name));
  const allNames = new Set([...inboundNames, ...outboundNames]);

  for (const adapter of [...arch.primary, ...arch.secondary]) {
    const kind = adapter.side === "driving" ? "primary" : "secondary";
    if (adapter.implements.length === 0) {
      throw new ParseError(
        `adapter '${adapter.name}' (${kind}) implements no ports; ` +
          `an adapter must connect to at least one port`,
      );
    }
    for (const target of adapter.implements) {
      if (!allNames.has(target)) {
        throw new ParseError(
          `adapter '${adapter.name}' implements unknown port '${target}'`,
        );
      }
      const expected =
        adapter.side === "driving" ? inboundNames : outboundNames;
      if (!expected.has(target)) {
        const want = adapter.side === "driving" ? "inbound" : "outbound";
        const wrong = adapter.side === "driving" ? "outbound" : "inbound";
        throw new ParseError(
          `${kind} adapter '${adapter.name}' implements ${wrong} port ` +
            `'${target}'; ${kind} adapters must implement ${want} ports`,
        );
      }
    }
  }

  const primaryNames = new Set(arch.primary.map((a) => a.name));
  for (const actor of arch.actors) {
    for (const target of actor.drives) {
      if (!primaryNames.has(target)) {
        throw new ParseError(
          `actor '${actor.name}' drives unknown primary adapter '${target}'`,
        );
      }
    }
  }
}
