/**
 * Requirement 7 (phase-2-tools.md): a derived row is built by copying the
 * current folded row and overriding the changed fields — never by
 * enumerating fields into a fresh object literal. The prior implementation
 * lost a moved event's duration and its parent link exactly this way: a
 * status-change record was built from an explicit field list that predated
 * those columns, so they silently dropped and the fold made the loss
 * permanent.
 *
 * `rowId` and `createdAt` are the two columns every insert-only table
 * regenerates itself (see schema.ts) — they identify *this* row, not the
 * entity, so they're always stripped before the values are used to build
 * the next insert. Every other field carries forward untouched unless
 * `overrides` names it, which is what makes adding a new column to a table
 * automatically safe: this function needs no change to keep carrying it.
 */
export function carryForward<TRow extends { rowId: string; createdAt: Date }, TOverrides extends Partial<TRow>>(
  current: TRow,
  overrides: TOverrides,
): Omit<TRow, "rowId" | "createdAt"> {
  const { rowId: _rowId, createdAt: _createdAt, ...rest } = current;
  return { ...rest, ...overrides };
}
