import type { AuthCliOptions } from "./cli.js";
import { parserEnvs } from "./envs.js";
import { authorizeOura } from "./services/oura-auth.js";
import { isOuraEnv, type OuraEnv } from "./services/oura.js";

export const selectOuraEnv = (envs: unknown[]): OuraEnv => {
    const ouraEnvs = envs.filter((env): env is OuraEnv => isOuraEnv(env));
    if (ouraEnvs.length === 0) {
        throw new Error("No Oura configuration was found in CHRONIXD_ENVS");
    }
    if (ouraEnvs.length > 1) {
        throw new Error("auth oura requires exactly one Oura configuration in CHRONIXD_ENVS");
    }
    return ouraEnvs[0];
};

export const runAuth = async (options: AuthCliOptions): Promise<void> => {
    if (options.service !== "oura") {
        throw new Error(`Unsupported auth service: ${String(options.service)}`);
    }
    const env = selectOuraEnv(parserEnvs());
    await authorizeOura(env);
};
