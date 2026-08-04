import type { PlacementCandidate } from "./placement.js";

/**
 * Reorders the model's ordering so a candidate never precedes something it
 * depends on — `placeTasks` places first-fit **in array order**
 * (placement.ts's Requirement 18), so this is the entire placement-side
 * enforcement of a dependency: the constraint has to be real before the
 * array reaches `placeTasks`, not requested of the model that produced the
 * ordering in the first place (schedule_generation_system_prompt already
 * treats placement as arithmetic the backend does, not something the model
 * decides — a dependency constraint is the same kind of thing).
 *
 * Kahn's algorithm, seeded with the model's array position as the
 * tie-break: among candidates with no unplaced dependency left, the one
 * earliest in the model's own ordering goes next. This preserves the
 * model's relative ordering everywhere it doesn't conflict with a
 * dependency edge, and only reorders where it must.
 *
 * A `dependsOn` id outside the candidate set (already completed, or not
 * part of this run) imposes no constraint — nothing here to reorder
 * against. A cycle should never reach this function (assertNoDependencyCycle
 * rejects one at write time), but if one somehow did, the leftover
 * candidates are appended in their original relative order rather than
 * looping forever.
 */
export function applyDependencyOrder(candidates: readonly PlacementCandidate[]): PlacementCandidate[] {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const indexOf = new Map(candidates.map((candidate, index) => [candidate.id, index]));
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const candidate of candidates) {
    const deps = (candidate.dependsOn ?? []).filter((depId) => byId.has(depId));
    inDegree.set(candidate.id, deps.length);
    for (const depId of deps) {
      const list = dependents.get(depId);
      if (list) {
        list.push(candidate.id);
      } else {
        dependents.set(depId, [candidate.id]);
      }
    }
  }

  const remaining = new Set(candidates.map((candidate) => candidate.id));
  const ordered: PlacementCandidate[] = [];

  while (remaining.size > 0) {
    let nextId: string | undefined;
    let nextIndex = Infinity;
    for (const id of remaining) {
      if ((inDegree.get(id) ?? 0) === 0) {
        const index = indexOf.get(id)!;
        if (index < nextIndex) {
          nextIndex = index;
          nextId = id;
        }
      }
    }

    if (!nextId) {
      for (const id of remaining) {
        ordered.push(byId.get(id)!);
      }
      break;
    }

    ordered.push(byId.get(nextId)!);
    remaining.delete(nextId);
    for (const dependentId of dependents.get(nextId) ?? []) {
      inDegree.set(dependentId, (inDegree.get(dependentId) ?? 0) - 1);
    }
  }

  return ordered;
}
