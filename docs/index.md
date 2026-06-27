---
layout: home
title: unthrown — explicit errors as values for TypeScript
description: Explicit errors as values, with a separate defect channel for the unexpected and qualification enforced at every boundary.

hero:
  name: "unthrown"
  text: "Explicit errors as values"
  tagline: A small, focused Result type with a separate defect channel for the unexpected — and qualification enforced at every boundary.
  image:
    src: /logo.svg
    alt: unthrown
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Why unthrown?
      link: /guide/why-unthrown
    - theme: alt
      text: GitHub
      link: https://github.com/btravstack/unthrown

features:
  - icon: 🎯
    title: Errors as values
    details: Ordinary errors are returned in a Result<T, E>, not thrown. Only a true defect ever throws — and only at unwrap.
  - icon: 🧯
    title: A separate defect channel
    details: Unmodeled failures become a Defect — a third runtime state invisible to the type. A bug in a .map can't masquerade as a domain error.
  - icon: 🛂
    title: Qualification at every boundary
    details: fromPromise / fromThrowable force you to triage each failure into a modeled error or a defect. No path ever yields `unknown` in E.
  - icon: 🪶
    title: Small and done-able
    details: Zero runtime dependencies, ESM-first, dual CJS/ESM, fully typed. One concept, one name. Small enough to be "done".
---

## At a glance

```ts
import { Ok, Err, Defect, fromPromise, type Result } from "unthrown";

class NotFound extends TaggedError("NotFound") {}

function findUser(id: string): Result<User, NotFound> {
  const user = users.get(id);
  return user ? Ok(user) : Err(new NotFound());
}

// Cross an async boundary — every rejection MUST be triaged.
const profile = fromPromise(fetch(`/u/${id}`), (cause) =>
  cause instanceof Response ? new NotFound() : Defect(cause),
);

// Handle every channel once, at the edge — no surrounding try/catch.
const status = await profile.match({
  ok: () => 200,
  err: () => 404,
  defect: () => 500,
});
```

Ordinary errors travel as values through `map` / `flatMap` / `match`. A thrown
bug becomes a **defect** that short-circuits to the edge — never silently folded
into your domain errors.
