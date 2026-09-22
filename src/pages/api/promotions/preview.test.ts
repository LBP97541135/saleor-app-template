import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@saleor/sdk", () => ({
  parseRule: vi.fn(),
  evaluate: vi.fn(),
}));

import type { Cart, DiscountEvaluation, Rule } from "@saleor/sdk";
import { evaluate, parseRule } from "@saleor/sdk";

import handler from "./preview";

const parseRuleMock = parseRule as unknown as ReturnType<typeof vi.fn>;
const evaluateMock = evaluate as unknown as ReturnType<typeof vi.fn>;

const parsedRules = [{ id: "rule-1", type: "percentage" }] as unknown as Rule;
const cart = {
  id: "cart-1",
  lines: [{ variantId: "variant-1", quantity: 2 }],
} as unknown as Cart;
const evaluation = {
  currency: "USD",
  discountAmount: 10,
  appliedRules: ["rule-1"],
} as unknown as DiscountEvaluation;

type MockResponse = {
  statusCode: number;
  body: unknown;
  headers: Record<string, unknown>;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
};

function createResponse(): MockResponse {
  const res = {
    statusCode: 200,
    body: undefined,
    headers: {},
    status: vi.fn(),
    json: vi.fn(),
    setHeader: vi.fn(),
  } as unknown as MockResponse;

  res.status.mockImplementation((code: number) => {
    res.statusCode = code;

    return res;
  });
  res.json.mockImplementation((payload: unknown) => {
    res.body = payload;

    return res;
  });
  res.setHeader.mockImplementation((name: string, value: unknown) => {
    res.headers[name] = value;

    return res;
  });

  return res;
}

async function invoke(body: unknown, method = "POST") {
  const req = { method, body } as unknown as NextApiRequest;
  const res = createResponse();

  await handler(req, res as unknown as NextApiResponse);

  return res;
}

describe("POST /api/promotions/preview", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with the DiscountEvaluation for a valid request", async () => {
    const requestRules = [{ id: "rule-1", type: "percentage" }];
    parseRuleMock.mockReturnValue(parsedRules);
    evaluateMock.mockReturnValue(evaluation);

    const res = await invoke({ rules: requestRules, cart });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toEqual(evaluation);
    expect(parseRuleMock).toHaveBeenCalledWith(requestRules);
    expect(evaluateMock).toHaveBeenCalledWith(parsedRules, cart);
  });

  it("returns 400 when required parameters are missing", async () => {
    const withoutCart = await invoke({ rules: [{ id: "rule-1" }] });
    expect(withoutCart.status).toHaveBeenCalledWith(400);
    expect(withoutCart.body).toHaveProperty("error");

    const withoutRules = await invoke({ cart });
    expect(withoutRules.status).toHaveBeenCalledWith(400);

    const emptyBody = await invoke({});
    expect(emptyBody.status).toHaveBeenCalledWith(400);

    expect(parseRuleMock).not.toHaveBeenCalled();
    expect(evaluateMock).not.toHaveBeenCalled();
  });

  it("returns 400 for parameter type errors", async () => {
    const invalidRules = await invoke({ rules: "not-an-array", cart });
    expect(invalidRules.status).toHaveBeenCalledWith(400);

    const invalidCart = await invoke({
      rules: [{ id: "rule-1" }],
      cart: 42,
    });
    expect(invalidCart.status).toHaveBeenCalledWith(400);

    const invalidCartArray = await invoke({
      rules: [{ id: "rule-1" }],
      cart: [],
    });
    expect(invalidCartArray.status).toHaveBeenCalledWith(400);

    expect(evaluateMock).not.toHaveBeenCalled();
  });

  it("returns 400 when parseRule rejects an invalid rule", async () => {
    parseRuleMock.mockImplementation(() => {
      throw new Error("unknown rule type");
    });

    const res = await invoke({ rules: [{ id: "rule-1" }], cart });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(evaluateMock).not.toHaveBeenCalled();
  });

  it("returns 500 when evaluate throws", async () => {
    parseRuleMock.mockReturnValue(parsedRules);
    evaluateMock.mockImplementation(() => {
      throw new Error("evaluation failed");
    });

    const res = await invoke({ rules: [{ id: "rule-1" }], cart });

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual({
      error: expect.stringContaining("evaluation failed"),
    });
  });

  it("returns 405 for unsupported HTTP methods", async () => {
    const res = await invoke({ rules: [], cart }, "GET");

    expect(res.status).toHaveBeenCalledWith(405);
  });
});
