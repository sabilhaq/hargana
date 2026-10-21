export type CoreErrorCode =
  | "not_found"
  | "branch_needs_chain"
  | "market_has_no_chain"
  | "chain_in_other_region"
  | "invalid"
  | "invalid_barcode"
  | "barcode_taken"
  | "no_current_store"
  | "incompatible_unit"
  | "no_price";

export class CoreError extends Error {
  constructor(
    readonly code: CoreErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = "CoreError";
  }
}
