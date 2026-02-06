import { expect, test, describe, spyOn, beforeEach, afterEach } from "bun:test";
import { fetchLocation, isLocationEnv, LocationType } from "./location.js";

describe("isLocationEnv", () => {
    test("returns true for valid LocationEnv", () => {
        const env = {
            location_api_url: "https://example.com/api/locations",
            location_api_token: "test-token",
        };
        expect(isLocationEnv(env)).toBe(true);
    });

    test("returns true with optional device_id", () => {
        const env = {
            location_api_url: "https://example.com/api/locations",
            location_api_token: "test-token",
            location_device_id: "device-1",
        };
        expect(isLocationEnv(env)).toBe(true);
    });

    test("returns false when location_api_url is missing", () => {
        const env = {
            location_api_token: "test-token",
        };
        expect(isLocationEnv(env)).toBe(false);
    });

    test("returns false when location_api_token is missing", () => {
        const env = {
            location_api_url: "https://example.com/api/locations",
        };
        expect(isLocationEnv(env)).toBe(false);
    });

    test("returns false for null", () => {
        expect(isLocationEnv(null)).toBe(false);
    });

    test("returns false for non-object", () => {
        expect(isLocationEnv("string")).toBe(false);
    });
});

describe("fetchLocation", () => {
    const mockGeoJSONResponse = {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                geometry: {
                    type: "Point",
                    coordinates: [139.7671, 35.6812], // [lon, lat]
                },
                properties: {
                    timestamp: "2024-01-15T10:30:00Z",
                    device_id: "device-1",
                    speed: 1.44, // m/s (~5.2 km/h)
                    poi: "東京駅",
                    address: "東京都千代田区丸の内1丁目",
                },
            },
            {
                type: "Feature",
                geometry: {
                    type: "Point",
                    coordinates: [-122.4194, 37.7749], // San Francisco
                },
                properties: {
                    timestamp: "2024-01-15T11:00:00Z",
                    device_id: "device-1",
                },
            },
        ],
    };

    const mockEnv = {
        location_api_url: "https://example.com/api/locations",
        location_api_token: "test-token",
    };

    let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

    beforeEach(() => {
        process.env.CHRONIXD_DRY_RUN = "true";
    });

    afterEach(() => {
        delete process.env.CHRONIXD_DRY_RUN;
        fetchSpy.mockRestore();
    });

    test("fetches and converts location data to LocationRecords", async () => {
        fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(mockGeoJSONResponse),
        } as Response);

        const result = await fetchLocation(mockEnv, null);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const callArgs = fetchSpy.mock.calls[0];
        expect(callArgs[0]).toContain("https://example.com/api/locations");
        expect(callArgs[0]).toContain("format=geojson");
        expect(callArgs[1]).toEqual({
            headers: {
                Authorization: "Bearer test-token",
            },
        });

        expect(result.length).toBe(2);

        // First item - Tokyo with address, POI and speed
        expect(result[0].type).toBe(LocationType);
        expect(result[0].latitude).toBe(35.6812);
        expect(result[0].longitude).toBe(139.7671);
        expect(result[0].speed).toBe(1.44);
        expect(result[0].address).toBe("東京都千代田区丸の内1丁目");
        expect(result[0].poi).toBe("東京駅");
        expect(result[0].unixTimeMs).toBe(new Date("2024-01-15T10:30:00Z").getTime());

        // Second item - San Francisco
        expect(result[1].type).toBe(LocationType);
        expect(result[1].latitude).toBe(37.7749);
        expect(result[1].longitude).toBe(-122.4194);
        expect(result[1].speed).toBeUndefined();
    });

    test("adds device_id to query when provided", async () => {
        fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ type: "FeatureCollection", features: [] }),
        } as Response);

        const envWithDevice = {
            ...mockEnv,
            location_device_id: "my-device",
        };

        await fetchLocation(envWithDevice, null);

        const callUrl = fetchSpy.mock.calls[0][0] as string;
        expect(callUrl).toContain("device_id=my-device");
    });

    test("adds from parameter with ISO 8601 format when lastRecord exists", async () => {
        fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(mockGeoJSONResponse),
        } as Response);

        const lastRecord = {
            type: "Location" as typeof LocationType,
            latitude: 0,
            longitude: 0,
            unixTimeMs: new Date("2024-01-15T10:45:00Z").getTime(),
        };

        const result = await fetchLocation(mockEnv, lastRecord);

        const callUrl = fetchSpy.mock.calls[0][0] as string;
        expect(callUrl).toContain("from=2024-01-15T10%3A45%3A00.000Z");

        // Only the second item (11:00) should be returned
        expect(result.length).toBe(1);
        expect(result[0].latitude).toBe(37.7749);
    });

    test("uses 24 hours ago as default from when lastRecord is null", async () => {
        fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(mockGeoJSONResponse),
        } as Response);

        await fetchLocation(mockEnv, null);

        const callUrl = fetchSpy.mock.calls[0][0] as string;
        expect(callUrl).toContain("from=");
        expect(callUrl).toContain("to=");
    });

    test("always includes from and to parameters", async () => {
        fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(mockGeoJSONResponse),
        } as Response);

        const lastRecord = {
            type: "Location" as typeof LocationType,
            latitude: 0,
            longitude: 0,
            unixTimeMs: new Date("2024-01-15T10:45:00Z").getTime(),
        };

        await fetchLocation(mockEnv, lastRecord);

        const callUrl = fetchSpy.mock.calls[0][0] as string;
        expect(callUrl).toContain("from=2024-01-15T10%3A45%3A00.000Z");
        expect(callUrl).toContain("to=");
    });

    test("throws error on API failure", async () => {
        fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue({
            ok: false,
            status: 401,
            statusText: "Unauthorized",
        } as Response);

        await expect(fetchLocation(mockEnv, null)).rejects.toThrow(
            "Failed to fetch location: 401 Unauthorized"
        );
    });

    test("handles negative speed values", async () => {
        const response = {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    geometry: {
                        type: "Point",
                        coordinates: [0, 0],
                    },
                    properties: {
                        timestamp: "2024-01-15T10:30:00Z",
                        speed: -1,
                    },
                },
            ],
        };

        fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(response),
        } as Response);

        const result = await fetchLocation(mockEnv, null);

        expect(result[0].speed).toBeUndefined();
        expect(result[0].latitude).toBe(0);
        expect(result[0].longitude).toBe(0);
    });

    test("includes address and POI fields in record", async () => {
        const response = {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    geometry: {
                        type: "Point",
                        coordinates: [135.5023, 34.6937],
                    },
                    properties: {
                        timestamp: "2024-01-15T12:00:00Z",
                        poi: "大阪城",
                        address: "大阪府大阪市中央区大阪城1-1",
                    },
                },
            ],
        };

        fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(response),
        } as Response);

        const result = await fetchLocation(mockEnv, null);

        expect(result[0].address).toBe("大阪府大阪市中央区大阪城1-1");
        expect(result[0].poi).toBe("大阪城");
        expect(result[0].latitude).toBe(34.6937);
        expect(result[0].longitude).toBe(135.5023);
    });

    test("includes speed in m/s in record", async () => {
        const response = {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    geometry: {
                        type: "Point",
                        coordinates: [139.6917, 35.6895],
                    },
                    properties: {
                        timestamp: "2024-01-15T12:00:00Z",
                        speed: 2.78,
                        poi: "新宿駅",
                    },
                },
            ],
        };

        fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(response),
        } as Response);

        const result = await fetchLocation(mockEnv, null);

        expect(result[0].speed).toBe(2.78);
        expect(result[0].poi).toBe("新宿駅");
    });
});
