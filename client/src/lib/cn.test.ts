import { describe, expect, it } from "vitest";
import { STATUS_LABEL, TYPE_LABEL } from "./cn";

describe("labels", () => {
  it("covers every operational status used in the product", () => {
    expect(STATUS_LABEL.AWAITING_APPROVAL).toBe("Awaiting Approval");
    expect(TYPE_LABEL.COMPLIANCE_REQUEST).toBe("Compliance Request");
  });
});
