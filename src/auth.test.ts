import { describe, expect, test } from "bun:test";
import { selectOuraEnv } from "./auth.js";

const ouraEnv = {
    name: "ring",
    oura_1password_vault: "chronixd",
    oura_1password_item: "oura-oauth",
    oura_client_id: "client-id",
    oura_client_secret: "client-secret",
};

describe("selectOuraEnv", () => {
    test("selects the only Oura configuration", () => {
        expect(selectOuraEnv([ouraEnv])).toEqual(ouraEnv);
    });

    test("rejects multiple Oura configurations", () => {
        expect(() => selectOuraEnv([ouraEnv, { ...ouraEnv, name: "other" }])).toThrow(
            "exactly one Oura configuration",
        );
    });

    test("rejects a missing Oura configuration", () => {
        expect(() => selectOuraEnv([])).toThrow("No Oura configuration");
    });
});
