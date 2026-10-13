import { rmSync } from "node:fs";
import { dirname } from "node:path";

export default async function teardown() {
  const database = process.env.CLEANY_GATEWAY_E2E_DATABASE;
  if (database) rmSync(dirname(database), { recursive: true, force: true });
}
