import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * phase_2a-db-visibility.md Requirement 11 — one fixed credential pair,
 * checked before any handler runs. Comparison is constant-time on both
 * fields (Security and privacy's requirement): a naive `===` against a
 * single unchanging secret on a public domain is the one place a timing
 * side channel is practical to exploit, since the attacker can retry
 * indefinitely.
 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on mismatched lengths rather than returning
  // false — pad to the target's length first so a length mismatch alone
  // never short-circuits the comparison before it becomes constant-time.
  if (bufA.length !== bufB.length) {
    const padded = Buffer.alloc(bufB.length);
    bufA.copy(padded);
    return timingSafeEqual(padded, bufB) && bufA.length === bufB.length;
  }
  return timingSafeEqual(bufA, bufB);
}

function parseBasicAuth(header: string | undefined): { user: string; password: string } | undefined {
  if (!header?.startsWith("Basic ")) {
    return undefined;
  }
  let decoded: string;
  try {
    decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
  } catch {
    return undefined;
  }
  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex === -1) {
    return undefined;
  }
  return { user: decoded.slice(0, separatorIndex), password: decoded.slice(separatorIndex + 1) };
}

/**
 * Registered as an `onRequest` hook on the viewer listener only — runs
 * before every handler on that instance, so no query ever executes for an
 * unauthenticated request (Requirement 11).
 */
export function requireBasicAuth(expectedUser: string, expectedPassword: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const credentials = parseBasicAuth(request.headers.authorization);
    const authorized =
      credentials !== undefined &&
      safeEqual(credentials.user, expectedUser) &&
      safeEqual(credentials.password, expectedPassword);

    if (!authorized) {
      reply.header("WWW-Authenticate", "Basic realm=\"Personal Assistant\"");
      await reply.status(401).send({ status: "unauthorized" });
    }
  };
}
