import type { Cart, DiscountEvaluation, Rule } from "@saleor/sdk";
import { evaluate, parseRule } from "@saleor/sdk";
import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Request body of the promotions preview endpoint.
 *
 * Field names follow the saleor-sdk promotion contract:
 * `rules` (the promotion rules to parse) and `cart` (the cart to evaluate against).
 */
type PreviewRequestBody = {
  rules?: unknown;
  cart?: unknown;
};

/**
 * Response body. A successful evaluation is returned as the saleor-sdk
 * `DiscountEvaluation` shape, errors are returned as `{ error }`.
 */
type PreviewResponseBody = DiscountEvaluation | { error: string };

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * POST /api/promotions/preview
 *
 * Parses the incoming `rules` with saleor-sdk's `parseRule` and evaluates them
 * against the incoming `cart` with saleor-sdk's `evaluate`. The evaluation logic
 * lives in the SDK and is never re-implemented here.
 *
 * - 400 when the request body is missing/invalid parameters (including type errors)
 * - 500 when the SDK evaluation throws
 */
export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<PreviewResponseBody>,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const body = req.body as PreviewRequestBody | undefined;

  if (!isPlainObject(body)) {
    return res
      .status(400)
      .json({ error: "Invalid request body: expected a JSON object." });
  }

  const { rules, cart } = body;

  if (!Array.isArray(rules) || rules.length === 0) {
    return res
      .status(400)
      .json({ error: "Invalid `rules`: expected a non-empty array." });
  }

  if (!isPlainObject(cart)) {
    return res
      .status(400)
      .json({ error: "Invalid `cart`: expected an object." });
  }

  let parsedRules: Rule | Rule[];

  try {
    parsedRules = parseRule(rules as Rule[]);
  } catch (error) {
    return res.status(400).json({
      error: `Invalid promotion rule: ${(error as Error).message}`,
    });
  }

  try {
    const evaluation: DiscountEvaluation = evaluate(parsedRules, cart as Cart);

    return res.status(200).json(evaluation);
  } catch (error) {
    return res.status(500).json({
      error: `Failed to evaluate promotion rules: ${(error as Error).message}`,
    });
  }
}
