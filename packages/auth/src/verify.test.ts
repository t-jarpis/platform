import { describe, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { bearerToken, createTokenVerifier, TokenVerificationError } from "./index.js";

const issuer = "https://login.example.test";
const audience = "project-123";

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
  const verify = createTokenVerifier({ issuer, audience, keySource: createLocalJWKSet({ keys: [jwk] }) });
  const sign = (claims: Record<string, unknown>, exp: string | number = "5m", iss = issuer, aud = audience) =>
    new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(iss).setAudience(aud)
      .setSubject("user-1").setIssuedAt().setExpirationTime(exp).sign(privateKey);
  return { verify, sign };
}

describe("createTokenVerifier", () => {
  it("accepteert een geldig token en geeft de identiteit terug", async () => {
    const { verify, sign } = await setup();
    const id = await verify(await sign({ "urn:zitadel:iam:user:resourceowner:id": "org-9" }));
    expect(id.subject).toBe("user-1");
    expect(id.organizationId).toBe("org-9");
  });

  it("weigert een verlopen token met reden 'expired'", async () => {
    const { verify, sign } = await setup();
    const token = await sign({}, Math.floor(Date.now() / 1000) - 3600);
    await expect(verify(token)).rejects.toMatchObject({ reason: "expired" });
  });

  it("weigert een token van een andere uitgever of voor een ander publiek", async () => {
    const { verify, sign } = await setup();
    await expect(verify(await sign({}, "5m", "https://evil.test"))).rejects.toBeInstanceOf(TokenVerificationError);
    await expect(verify(await sign({}, "5m", issuer, "other"))).rejects.toMatchObject({ reason: "invalid" });
  });

  it("weigert een token met een onbekende sleutel", async () => {
    const { verify } = await setup();
    const other = await setup();
    await expect(verify(await other.sign({}))).rejects.toMatchObject({ reason: "invalid" });
  });
});

describe("bearerToken", () => {
  it("haalt het token uit de header", () => {
    expect(bearerToken("Bearer abc.def")).toBe("abc.def");
    expect(bearerToken("bearer   xyz")).toBe("xyz");
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
  });
});
