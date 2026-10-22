import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

/** Instellingen per site: welke Zitadel-uitgever en welk publiek (de API) geaccepteerd worden. */
export interface VerifierOptions {
  /** Uitgever, bijvoorbeeld `https://login.example.com`. */
  issuer: string;
  /** Verwacht publiek (`aud`), meestal het project-ID van de site in Zitadel. */
  audience: string | string[];
  /** Toegestane klokafwijking in seconden. Standaard 30. */
  clockToleranceSeconds?: number;
  /** Alleen voor tests: een eigen sleutelbron in plaats van de JWKS van de uitgever. */
  keySource?: JWTVerifyGetKey;
}

/** De gecontroleerde identiteit. Rechten komen uit de eigen database van de site, niet uit het token. */
export interface VerifiedIdentity {
  /** Stabiel gebruikers-ID in Zitadel (`sub`). */
  subject: string;
  /** Organisatie in Zitadel, als die in het token staat. */
  organizationId?: string;
  expiresAt: Date;
  claims: JWTPayload;
}

export type VerifyFailure = "expired" | "invalid";

export class TokenVerificationError extends Error {
  constructor(readonly reason: VerifyFailure, options?: { cause?: unknown }) {
    super(reason === "expired" ? "Access token is verlopen" : "Access token is ongeldig", options);
    this.name = "TokenVerificationError";
  }
}

const ORG_CLAIM = "urn:zitadel:iam:user:resourceowner:id";

/**
 * Maakt een functie die access tokens van Zitadel controleert: handtekening (via JWKS),
 * uitgever, publiek en geldigheid. Alleen RS256/ES256 worden geaccepteerd.
 */
export function createTokenVerifier(options: VerifierOptions) {
  const issuer = options.issuer.replace(/\/$/, "");
  const keys = options.keySource ?? createRemoteJWKSet(new URL(`${issuer}/oauth/v2/keys`));

  return async function verifyAccessToken(token: string): Promise<VerifiedIdentity> {
    try {
      const { payload } = await jwtVerify(token, keys, {
        issuer,
        audience: options.audience,
        algorithms: ["RS256", "ES256"],
        clockTolerance: options.clockToleranceSeconds ?? 30,
        requiredClaims: ["sub", "exp"],
      });
      const org = payload[ORG_CLAIM];
      return {
        subject: payload.sub as string,
        ...(typeof org === "string" ? { organizationId: org } : {}),
        expiresAt: new Date((payload.exp as number) * 1000),
        claims: payload,
      };
    } catch (error) {
      if (error instanceof errors.JWTExpired) throw new TokenVerificationError("expired", { cause: error });
      throw new TokenVerificationError("invalid", { cause: error });
    }
  };
}

/** Haalt het token uit een `Authorization: Bearer …`-header, of geeft `null`. */
export function bearerToken(header: string | undefined | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}
