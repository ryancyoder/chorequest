# The database

Project **yoderquest** — `uexmarficoqeifnpyphv`, region `us-east-2`.

## `migrations/` is empty — fill it before you change anything

Every migration so far was applied straight to the remote database, so that is
currently the only copy. Postgres has them all; one command brings them down:

```bash
npx supabase link --project-ref uexmarficoqeifnpyphv && npx supabase db pull
```

Do that **before** the next schema change, or a later `db push` will try to
recreate tables that already exist.

The nine, in order:

| | |
|---|---|
| `core`, `rpc`, `storage`, `tighten`, `default_privileges` | the shared identity layer — `households`, `household_users`, `people`, `person_pins`, `quest_profiles`, `laundry_profiles`, `settings`, `photos`, the RPCs, and the Storage buckets |
| `chorequest_domain` | the 18 ChoreQuest tables |
| `chorequest_rls_and_freeze` | policies and grants for those 18, realtime, and `is_earning_frozen()` becoming real |
| `member_rows_view` | the `member_rows` view, and a write path for `quest_profiles` |
| `revoke_anon` | took every table grant away from `anon` |

## What the schema assumes

**Identity is shared; economies are per-app.** `people` is one list for the
whole household, and each app hangs its own profile off it —
`quest_profiles` for ChoreQuest, `laundry_profiles` for the laundry app. This
is the thing the merge is built around: three apps, one answer to "who lives
here". Adding a third app means adding a third profile table, not a third
member list.

**One login per household.** `household_users` maps `auth.users` to a
household, and `current_household_id()` reads it. Every RLS policy in the
database is the same predicate: `household_id = current_household_id()`.

The consequence is worth being explicit about: **every phone in the house
presents the same `auth.uid()`**, so RLS enforces the household boundary and
nothing finer. It cannot stop Ava writing Micah's XP. The PIN is still the only
per-person boundary, exactly as it was on-device. If that ever needs to be
real, it means one auth user per person — a schema change to
`household_users`, not a policy tweak.

**`person_pins` has RLS on and zero policies.** That is not an oversight; it is
how the table is protected. No policy means no direct access from any client,
and the only ways in are the two SECURITY DEFINER RPCs. A PIN hash must never
be selectable. The security advisor reports this as INFO — leave it.

**`anon` holds no grants on anything.** RLS already returned nothing to an
unauthenticated caller, but that was a filter; a missing grant is a wall. See
`20260816204423_revoke_anon`.

## Two things are derived, never stored

Both were bugs in earlier versions of the on-device app, and the schema is
shaped to make them impossible to reintroduce:

- **A landmine's stage.** `landmines.status` is a *lifecycle* —
  `armed | cleared | void`. ARMED → TICKING → SMOKING → DETONATED is computed
  from `armed_at` and the household's rates. Storing the stage would need a job
  to advance it and could then contradict the timestamp it came from.
- **A boss's HP.** There is no `max_hp` column. HP comes from summing
  `boss_attacks.damage`, so reversing a hit cannot leave the health bar
  disagreeing with the list of attacks under it.

Anything that accrues over time follows the same rule as on-device:
`applied_drain` and `applied_fine` record what has *already* been charged, and
accrual pays the difference. Never `+= rate`.

## Realtime

`submissions, landmines, bosses, boss_attacks, stars, prs, pr_cheers, activity,
family_goals, quest_profiles` are in the `supabase_realtime` publication —
the things another phone must see change while you are looking at it. Static
config (chores, events, prizes) is deliberately left out; it is refetched on
demand and would only add chatter.

The client treats any event as "reload the household" rather than patching the
row it was told about. A household of seven is a few hundred rows, and hand
patching is how two devices end up believing different things about the same
boss fight.
