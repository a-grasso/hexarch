# The hexarch DSL

A small, purpose-built language for describing a **Hexagonal Architecture
(Ports & Adapters)** and nothing else. You describe the *architecture* - its
core, the ports on its boundary, the adapters that plug in, who drives it - and
the viewer decides how to draw it (placement, spacing, docking, arrows,
styling). The DSL speaks in Ports & Adapters nouns, not in generic graph edges.

The serialization is YAML. A spec is one file, conventionally named
`<something>.hexarch.yaml` (plain `.yaml`/`.yml` also works).

---

## The shape at a glance

```yaml
architecture:
  name: Order Service                    # required
  description: One line about the system # optional

actors:                                  # optional - who drives the system
  - name: Customer
    drives: [REST API]                   # names of primary adapters
    description: ...                      # optional

core:
  domain: [Order, Payment, LineItem]     # domain concepts (entities / VOs)
  application:
    services: [CreateOrder, CancelOrder] # application / use-case services

ports:
  inbound:                               # driving ports - what the core OFFERS
    - name: OrderCommand
      type: command                      # command | query | event | ... (open)
      description: ...                    # optional
      operations: [createOrder, cancelOrder]   # optional
  outbound:                              # driven ports - what the core REQUIRES
    - name: OrderRepository
      type: persistence
      operations: [save, findById]
    - PaymentGateway                     # shorthand: a bare string is a name

adapters:
  primary:                               # driving adapters (implement INBOUND)
    - name: REST API
      technology: Spring Boot            # optional
      implements: [OrderCommand]         # required, >= 1 declared port
      description: ...                    # optional
  secondary:                             # driven adapters (implement OUTBOUND)
    - name: PostgreSQL
      technology: PostgreSQL
      implements: [OrderRepository]
```

---

## Sections

### `architecture` (required)
| field | type | notes |
|-------|------|-------|
| `name` | string | the system / boundary name (diagram title) |
| `description` | string? | one-line subtitle |

### `actors` (optional)
External drivers of the system - a user, another system, a scheduler. Rendered
as dashed boxes to the left, wired to the primary adapters they use.
| field | type | notes |
|-------|------|-------|
| `name` | string | |
| `drives` | string[] | names of **primary** adapters this actor uses |
| `description` | string? | |

A bare string is shorthand for `{ name: <string>, drives: [] }`.

### `core` (optional)
The application core. `domain` lists the entities/value-objects; `application.services`
lists the use-case services. Both render as chips inside the hexagon and are
independently collapsible in the viewer.

### `ports` (optional)
The boundary. **Inbound** (driving) ports are what the application offers -
its use cases. **Outbound** (driven) ports are what the application requires,
expressed as interfaces the core owns.
| field | type | notes |
|-------|------|-------|
| `name` | string | required |
| `type` | string? | semantic hint - steers colour/label. Common: `command`, `query`, `event`, `persistence`, `external-service`, `messaging`, `notification`. Not a closed set. |
| `operations` | string[]? | the concrete operations; shown on hover |
| `description` | string? | shown on hover |

A bare string is shorthand for a port with just a `name`.

### `adapters` (optional)
Concrete technologies that plug into ports. **Primary** adapters are driving
(REST controllers, CLIs, test harnesses); **secondary** adapters are driven
(databases, queues, HTTP clients).
| field | type | notes |
|-------|------|-------|
| `name` | string | required |
| `technology` | string? | sub-label (e.g. `Spring Boot`, `PostgreSQL`) |
| `implements` | string[] | required, >= 1; the port(s) this adapter connects to |
| `description` | string? | |

---

## Relationships & flow

Relationships are expressed by `implements` (adapter -> port) and `drives`
(actor -> primary adapter). Everything flows left-to-right, mirroring the
canonical hexagonal picture:

```
actor -> primary adapter -> inbound port ) CORE ( outbound port -> secondary adapter
```

- A primary adapter *calls* an inbound port (drives the core).
- The core *reaches out* through an outbound port, which a secondary adapter fulfils.

Multiple adapters may implement the same port, and one adapter may implement
several ports; each pairing becomes its own arrow.

---

## Validation rules

The parser fails fast, naming the offending element, when:

1. An adapter's `implements` references a port that isn't declared.
2. A **primary** adapter implements an **outbound** port, or a **secondary**
   adapter implements an **inbound** port. (This silently breaks the dependency
   direction, so it's an error.)
3. An adapter implements no ports.
4. An actor `drives` an adapter that isn't a declared primary adapter.

Missing optional sections default to empty; a `type`/`technology`/`description`
may always be omitted.

---

## Design principles

- **Semantics, not drawing.** No coordinates, colours or sizes in the DSL. If
  you find yourself wanting to nudge pixels, that's the viewer's job.
- **Portable artifact.** The spec is plain YAML, committed next to the code it
  describes, diffable in review, and independent of any particular renderer.
- **Forgiving in, strict out.** Shorthands (bare strings) keep small specs
  terse; validation keeps them honest.

## Not (yet) modelled

Bounded-context grouping (multiple hexagons + context mapping), explicit
domain-to-domain relationships, and per-adapter multiplicity. The vocabulary is
intentionally small; these are the natural next extensions.
