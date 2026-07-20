---
name: hexarch
description: Author or update a hexarch architecture spec - the hexarch DSL (YAML) for describing a system as a Hexagonal / Ports-&-Adapters architecture, rendered to an interactive diagram by hex-render. Use when the user wants to describe, diagram, or document a system's hexagonal architecture; create or edit a *.hexarch.yaml file; or asks what the hexarch DSL is or how to write one.
---

# Authoring hexarch specs

The **hexarch DSL** describes a system in Ports & Adapters terms - core, ports,
adapters, actors - as portable YAML. The renderer (`hex-render`) owns every
visual decision; you only describe *intent*. Never put coordinates, colours, or
sizes in a spec.

Write specs to `<name>.hexarch.yaml`. The full grammar and validation rules are
in [reference/spec.md](reference/spec.md) - read it when you hit an edge case;
the summary below is enough for the common case.

## What you'll be asked to do

- **Create** a spec for a project - derive the architecture from the codebase
  and/or the user's description, then write `<name>.hexarch.yaml`.
- **Adapt** an existing spec - the code changed (a new adapter, a renamed port,
  a dropped dependency); bring the spec back in line.
- **Curate / lint** a spec - check it's valid and faithful, and improve it
  (right ports/types, no orphans, consistent naming).

When creating for an existing codebase, ground the model in the code: primary
adapters are the real entry points (controllers, CLI mains, consumers); outbound
ports are the interfaces the core depends on; secondary adapters are their
concrete implementations (DB clients, HTTP clients, brokers). Don't invent
structure the code doesn't have - if unsure whether something is on the
boundary, ask or leave it in the core.

## How to think it through (in this order)

1. **Core** - the domain entities/value-objects (`core.domain`) and the
   use-case/application services (`core.application.services`). Pure business
   concepts; no technology.
2. **Inbound (driving) ports** - what the application *offers*: its use cases,
   grouped into ports with a `type` (`command`, `query`, `event`, …) and the
   `operations` they expose. These are the entry points into the core.
3. **Outbound (driven) ports** - what the core *requires* from the outside,
   expressed as interfaces the core owns (`persistence`, `external-service`,
   `messaging`, `notification`, …).
4. **Primary (driving) adapters** - concrete tech that *calls* inbound ports
   (REST controller, CLI, scheduler). Each `implements` ≥1 inbound port.
5. **Secondary (driven) adapters** - concrete tech that *fulfils* outbound ports
   (a DB, a queue, an HTTP client). Each `implements` ≥1 outbound port.
6. **Actors** (optional) - external drivers (a user, another system) and which
   primary adapters they `drives`.

Flow reads left → right:
`actor → primary adapter → inbound port ) CORE ( outbound port → secondary adapter`

## Structure

```yaml
architecture:
  name: Order Service                      # required - the diagram title
  description: One line about the system   # optional

actors:                                    # optional
  - { name: Customer, drives: [REST API] } # drives = names of primary adapters

core:
  domain: [Order, Payment, LineItem]       # entities / value objects
  application:
    services: [CreateOrder, CancelOrder]   # use-case services

ports:
  inbound:                                 # driving - what the core OFFERS
    - name: OrderCommand
      type: command                        # command|query|event|… (open set)
      operations: [createOrder, cancelOrder]
      description: ...                      # optional; shown on hover
  outbound:                                # driven - what the core REQUIRES
    - name: OrderRepository
      type: persistence
      operations: [save, findById]
    - PaymentGateway                        # bare string = a port with just a name

adapters:
  primary:                                 # driving - implement INBOUND ports
    - name: REST API
      technology: Spring Boot               # optional sub-label
      implements: [OrderCommand]            # required, ≥1
  secondary:                               # driven - implement OUTBOUND ports
    - name: PostgreSQL
      technology: PostgreSQL
      implements: [OrderRepository]
```

Shorthands: a bare string anywhere a `{name: …}` is expected means a
name-only entry (ports, actors, domain/service lists).

## Rules that keep a spec valid (the parser enforces these)

- Every adapter's `implements` must name a **declared** port.
- **Primary** adapters implement **inbound** ports; **secondary** adapters
  implement **outbound** ports. Crossing this breaks dependency direction and is
  an error.
- Every adapter implements **≥1** port.
- An actor may only `drives` a declared **primary** adapter.
- Missing optional sections default to empty; `type`/`technology`/`description`
  are always optional.

## Getting it right

- Put a use case in an **inbound** port only if something *outside* calls it; put
  a dependency in an **outbound** port only if the *core* calls out to it. If you
  can't decide, it usually belongs in the core, not on the boundary.
- Group operations into ports by cohesion (one port per external concern), not
  one port per operation.
- Pick the closest `type` from the common set for good colour/labelling, but any
  string is allowed - use a meaningful custom type over a wrong stock one.

## Curate / lint an existing spec

When reviewing or maintaining a spec, check - and fix - the following:

1. **It parses.** `hex-render <file>` validates on load; a bad spec fails fast
   with the offending element named. Fix structural errors first.
2. **Direction is correct.** Primary adapters implement only inbound ports;
   secondary adapters only outbound. No adapter implements zero ports.
3. **No orphans.** Every declared port is implemented by ≥1 adapter (an
   unimplemented port is usually a modelling gap or a stale entry). Every actor
   drives a real primary adapter.
4. **Faithful to the code.** Ports/adapters/technologies still match reality -
   no renamed-away ports, no adapters for deleted integrations, tech labels
   current.
5. **Quality.** `type`s are the most accurate choice; operations are the real
   ones; names are consistent (a port and its adapter shouldn't disagree on
   terminology); cohesive grouping (not one port per operation).

Report what you changed and why; if something is ambiguous (is X on the boundary
or in the core?), surface it rather than guessing.

## Preview the result

If `hex-render` is installed (`brew install a-grasso/tap/hex-render`, or build
from source):

```bash
hex-render path/to/arch.hexarch.yaml        # render + open in the browser
hex-render --serve path/to/arch.hexarch.yaml # live-reload while you edit
hex-render -o arch.html path/to/arch.hexarch.yaml  # save a shareable HTML
```

After writing or editing a spec, offer to render it so the user can see the
diagram. If `hex-render` isn't available, the spec is still valid and portable -
say so and point at the install options.

See [reference/spec.md](reference/spec.md) for the complete specification and
[reference/examples/](reference/examples/) for full worked specs.
