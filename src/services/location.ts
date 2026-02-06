import { BaseRecord, LocationRecord } from "../common/types.js";
import { createCache } from "../common/cache.js";
import { createLogger } from "../common/logger.js";

const logger = createLogger("Location");

export type LocationEnv = {
    location_api_url: string;
    location_api_token: string;
    location_device_id?: string;
};

export const LocationType = "Location" as const;

export const isLocationEnv = (env: unknown): env is LocationEnv => {
    if (typeof env !== "object" || env === null) {
        return false;
    }
    const e = env as Record<string, unknown>;
    return typeof e.location_api_url === "string" && typeof e.location_api_token === "string";
};

type GeoJSONFeature = {
    type: "Feature";
    geometry: {
        type: "Point";
        coordinates: [number, number]; // [longitude, latitude]
    };
    properties: {
        timestamp: string;
        device_id?: string;
        speed?: number;
        altitude?: number;
        horizontal_accuracy?: number;
        vertical_accuracy?: number;
        address?: string;
        poi?: string;
    };
};

type GeoJSONResponse = {
    type: "FeatureCollection";
    features: GeoJSONFeature[];
};

type CacheItem = {
    id: string;
    unixTimeMs: number;
};

const createLocationId = (feature: GeoJSONFeature): string => {
    const timestamp = feature.properties.timestamp;
    const [lon, lat] = feature.geometry.coordinates;
    return `${timestamp}-${lat}-${lon}`;
};

const createGoogleMapsUrl = (lat: number, lon: number): string => {
    return `https://www.google.com/maps?q=${lat},${lon}`;
};

const updateCacheItems = ({
    oldItems,
    newItems,
    today = new Date(),
}: {
    oldItems: CacheItem[];
    newItems: CacheItem[];
    today?: Date;
}): CacheItem[] => {
    const combined = [...oldItems, ...newItems];
    const oneDayAgo = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    return combined.filter((item) => item.unixTimeMs >= oneDayAgo.getTime());
};

const formatSpeed = (speedMps: number | undefined): number | undefined => {
    if (speedMps === undefined || speedMps < 0) {
        return undefined;
    }
    return speedMps;
};

const convertFeatureToLocationRecord = (feature: GeoJSONFeature): LocationRecord => {
    const [lon, lat] = feature.geometry.coordinates;
    const url = createGoogleMapsUrl(lat, lon);
    const unixTimeMs = new Date(feature.properties.timestamp).getTime();

    return {
        type: LocationType,
        url,
        unixTimeMs,
        latitude: lat,
        longitude: lon,
        altitude: feature.properties.altitude,
        speed: formatSpeed(feature.properties.speed),
        address: feature.properties.address,
        poi: feature.properties.poi,
    };
};

export const fetchLocation = async (
    env: LocationEnv,
    lastRecord: BaseRecord | null
): Promise<LocationRecord[]> => {
    const url = new URL(env.location_api_url);
    if (env.location_device_id) {
        url.searchParams.set("device_id", env.location_device_id);
    }
    url.searchParams.set("format", "geojson");

    const now = new Date();
    const fromDate = lastRecord
        ? new Date(lastRecord.unixTimeMs)
        : new Date(now.getTime() - 24 * 60 * 60 * 1000);
    url.searchParams.set("from", fromDate.toISOString());
    url.searchParams.set("to", now.toISOString());

    const response = await fetch(url.toString(), {
        headers: {
            Authorization: `Bearer ${env.location_api_token}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch location: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as GeoJSONResponse;
    logger.info("Location features count", data.features.length);

    const cache = createCache<CacheItem>("location.json");
    const oldItems = await cache.read();
    const oldItemIds = new Set(oldItems.map((item) => item.id));

    const newFeatures = data.features.filter((feature) => {
        const id = createLocationId(feature);
        if (oldItemIds.has(id)) {
            return false;
        }
        if (lastRecord) {
            const featureTime = new Date(feature.properties.timestamp).getTime();
            if (featureTime <= lastRecord.unixTimeMs) {
                return false;
            }
        }
        return true;
    });

    logger.info("New location features count", newFeatures.length);

    const newCacheItems: CacheItem[] = newFeatures.map((feature) => ({
        id: createLocationId(feature),
        unixTimeMs: new Date(feature.properties.timestamp).getTime(),
    }));

    const updatedCache = updateCacheItems({
        oldItems,
        newItems: newCacheItems,
    });
    await cache.write(updatedCache);

    return newFeatures.map(convertFeatureToLocationRecord);
};
