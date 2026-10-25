/**
 * @thuso/core: the inside of the Clean Architecture.
 * Domain (entities and rules) and application (use cases and ports) for every module.
 * Nothing in here may import React, Firebase or any vendor SDK (enforced by ESLint).
 */
export * from "./shared";
export * from "./workspace";
export * from "./customers";
export * from "./bookings";
export * from "./invoicing";
export * from "./stock";
export * from "./workflows";
export * from "./assistant";
export * from "./storage";

import type { WorkspaceOp } from "./workspace";
import type { CustomerOp } from "./customers";
import type { WorkflowOp } from "./workflows";

/** Every write any use case can ask for. Adapters implement Writer<AnyOp>. */
export type AnyOp = WorkspaceOp | CustomerOp | WorkflowOp;
