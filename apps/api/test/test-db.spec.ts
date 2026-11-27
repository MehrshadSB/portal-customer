import { Client } from "pg";
import { describe, expect, it } from "vitest";

describe("PostgreSQL connection", () => {
  it("should connect to PostgreSQL and execute a query", async () => {
    const client = new Client({
      host: "localhost",
      port: 5432,
      user: "portal",
      password: "portal_dev_password",
      database: "portal_dev",
    });

    try {
      await client.connect();

      const result = await client.query("SELECT NOW() AS current_time");

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].current_time).toBeDefined();

      console.log("✅ PostgreSQL connection successful!");
      console.log("Database time:", result.rows[0].current_time);
    } finally {
      await client.end();
    }
  });
});