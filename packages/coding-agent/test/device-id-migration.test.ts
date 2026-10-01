import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ENV_AGENT_DIR } from "../src/config.ts";
import { runMigrations } from "../src/migrations.ts";

// https://github.com/earendil-works/pi/issues/10187
describe("deviceId migration", () => {
	const tempDirs: string[] = [];
	const deviceId = "0b5c7d3e-8f1a-4c2b-9d6e-1a2b3c4d5e6f";

	afterEach(() => {
		for (const dir of tempDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	function migrate(files: { settings: unknown; auth?: unknown }): { settings: unknown; auth: unknown } {
		const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-device-id-migration-test-"));
		tempDirs.push(agentDir);
		const settingsPath = path.join(agentDir, "settings.json");
		const authPath = path.join(agentDir, "auth.json");
		fs.writeFileSync(settingsPath, JSON.stringify(files.settings));
		if (files.auth) fs.writeFileSync(authPath, JSON.stringify(files.auth));

		const previousAgentDir = process.env[ENV_AGENT_DIR];
		process.env[ENV_AGENT_DIR] = agentDir;
		try {
			runMigrations(agentDir);
		} finally {
			if (previousAgentDir === undefined) delete process.env[ENV_AGENT_DIR];
			else process.env[ENV_AGENT_DIR] = previousAgentDir;
		}

		return {
			settings: JSON.parse(fs.readFileSync(settingsPath, "utf-8")),
			auth: fs.existsSync(authPath) ? JSON.parse(fs.readFileSync(authPath, "utf-8")) : undefined,
		};
	}

	it("moves deviceId from settings.json to auth.json", () => {
		const credential = { type: "api_key", key: "anthropic-key" };

		expect(migrate({ settings: { theme: "dark", deviceId }, auth: { anthropic: credential } })).toEqual({
			settings: { theme: "dark" },
			auth: { anthropic: credential, deviceId },
		});
	});

	it("creates auth.json for the moved deviceId", () => {
		expect(migrate({ settings: { deviceId } })).toEqual({ settings: {}, auth: { deviceId } });
	});

	it("keeps the deviceId already in auth.json", () => {
		const existing = "7e6d5c4b-3a2f-4e1d-8c9b-0a1b2c3d4e5f";

		expect(migrate({ settings: { deviceId }, auth: { deviceId: existing } })).toEqual({
			settings: {},
			auth: { deviceId: existing },
		});
	});

	it("leaves files without a deviceId in settings.json unchanged", () => {
		expect(migrate({ settings: { theme: "dark" } })).toEqual({ settings: { theme: "dark" }, auth: undefined });
	});
});
