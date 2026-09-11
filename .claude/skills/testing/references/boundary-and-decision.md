# Worked example: two-point BVA + decision table

Example spec (a typical `CreateListingDto`-shaped input in this backend):

```ts
class CreateListingDto {
  @IsInt() @Min(1)
  quantity: number;

  @IsNumber() @Min(0.01) @Max(999999.99)
  price: number;

  @IsOptional() @ValidateIf(o => o.isAuction === true)
  @IsDateString()
  auctionEndsAt?: string;

  @IsBoolean()
  isAuction: boolean;
}
```

## Two-point BVA

Each decorator is its own boundary — two points each, not a middle value:

| Field | Boundary | Point at boundary | Point across boundary |
|---|---|---|---|
| `quantity` | `@Min(1)` | `1` (valid) | `0` (invalid) |
| `price` | `@Min(0.01)` | `0.01` (valid) | `0.00` (invalid) |
| `price` | `@Max(999999.99)` | `999999.99` (valid) | `1000000.00` (invalid) |

That's it per boundary — resist adding a third "comfortably valid" case here; the happy-path test elsewhere already covers that.

## Decision table

Conditions exposed by the spec: `isAuction` (bool), `auctionEndsAt` present (bool). 2 independent conditions → full combinatorial (4 rows):

| `isAuction` | `auctionEndsAt` present | Expected outcome |
|---|---|---|
| false | absent | valid |
| false | present | valid (ignored/allowed — confirm against spec, don't assume) |
| true | absent | invalid — required when auctioning |
| true | present | valid |

Each row → one test case. If a project rule instead says "present when not auctioning is an error," that's a spec question to resolve before writing the table, not something to infer from current code behavior.

## When conditions exceed ~4

Switch to pairwise: every pair of condition values appears in at least one row, rather than every combination. State this downgrade explicitly, e.g. in a comment above the `describe` block: `// 5 independent conditions -> pairwise coverage, not full combinatorial`.
