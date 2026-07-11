import * as fs from "fs/promises";
import * as path from "path";
import { createHash, randomUUID } from "crypto";
import { hostname } from "os";
import { BaseRecord, FetchOptions, OuraRecord, OuraDataType, ServiceDefinition } from "../common/types.js";
import { RateLimitError } from "../common/RateLimitError.js";
import { fetchWithRetry } from "../common/fetchWithRetry.js";
import { createLogger } from "../common/logger.js";
import {
    markOuraOnePasswordRefreshUncertain,
    type OnePasswordCommandRunner,
    type OuraOnePasswordConfig,
    type OuraTokenState,
    readOuraOnePasswordTokenState,
    writeOuraOnePasswordTokenState,
} from "./oura-onepassword.js";

const logger = createLogger("Oura");

const OURA_API_BASE_URL = "https://api.ouraring.com/v2/usercollection";
const OURA_TOKEN_URL = "https://api.ouraring.com/oauth/token";
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_HISTORY_DAYS = 30;
const DEFAULT_LOOKBACK_DAYS = 7;

export const OuraType = "Oura" as const;

export const OURA_DATA_TYPES = [
    "daily_activity",
    "daily_readiness",
    "daily_sleep",
    "sleep",
] as const satisfies readonly OuraDataType[];

export type OuraEnv = {
    name?: string;
    oura_access_token?: string;
    oura_refresh_token?: string;
    oura_client_id?: string;
    oura_client_secret?: string;
    oura_token_store?: "file" | "1password";
    oura_1password_vault?: string;
    oura_1password_item?: string;
    oura_data_types?: OuraDataType[];
    oura_history_days?: number;
    oura_lookback_days?: number;
    oura_timezone?: string;
};

type OuraDocument = Record<string, unknown>;

type OuraCollectionResponse = {
    data: OuraDocument[];
    next_token?: string | null;
};

type OuraTokenResponse = {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
};

type FetchOuraDependencies = {
    now?: Date;
    cacheDir?: string;
    onePasswordCommandRunner?: OnePasswordCommandRunner;
};

const isNonEmptyString = (value: unknown): value is string => {
    return typeof value === "string" && value.length > 0;
};

export const isOuraEnv = (env: unknown): env is OuraEnv => {
    if (typeof env !== "object" || env === null) {
        return false;
    }
    const value = env as Record<string, unknown>;
    return isNonEmptyString(value.oura_access_token)
        || (
            value.oura_token_store === "1password"
            && isNonEmptyString(value.oura_1password_vault)
            && isNonEmptyString(value.oura_1password_item)
        );
};

const isOuraDataType = (value: unknown): value is OuraDataType => {
    return typeof value === "string" && (OURA_DATA_TYPES as readonly string[]).includes(value);
};

const getOptionalNumber = (document: OuraDocument, key: string): number | null | undefined => {
    const value = document[key];
    return typeof value === "number" || value === null ? value : undefined;
};

const getOptionalString = (document: OuraDocument, key: string): string | null | undefined => {
    const value = document[key];
    return typeof value === "string" || value === null ? value : undefined;
};

const parseDocumentTime = (document: OuraDocument, dataType: OuraDataType): number => {
    const candidates = dataType === "sleep"
        ? [document.bedtime_end, document.bedtime_start]
        : [document.timestamp];

    for (const candidate of candidates) {
        if (typeof candidate !== "string") continue;
        const unixTimeMs = new Date(candidate).getTime();
        if (!Number.isNaN(unixTimeMs)) {
            return unixTimeMs;
        }
    }

    throw new Error(`Oura ${dataType} document has no valid timestamp`);
};

export const convertOuraDocument = (dataType: OuraDataType, document: OuraDocument): OuraRecord => {
    if (!isNonEmptyString(document.id)) {
        throw new Error(`Oura ${dataType} document has no valid id`);
    }
    if (!isNonEmptyString(document.day)) {
        throw new Error(`Oura ${dataType} document has no valid day`);
    }

    const record: OuraRecord = {
        type: OuraType,
        id: document.id,
        dataType,
        day: document.day,
        unixTimeMs: parseDocumentTime(document, dataType),
        rawData: JSON.stringify(document),
    };

    const score = getOptionalNumber(document, "score");
    if (score !== undefined) record.score = score;

    if (dataType === "daily_activity") {
        const steps = getOptionalNumber(document, "steps");
        const activeCalories = getOptionalNumber(document, "active_calories");
        if (steps !== undefined) record.steps = steps;
        if (activeCalories !== undefined) record.activeCalories = activeCalories;
    } else if (dataType === "daily_readiness") {
        const temperatureDeviation = getOptionalNumber(document, "temperature_deviation");
        if (temperatureDeviation !== undefined) record.temperatureDeviation = temperatureDeviation;
    } else if (dataType === "sleep") {
        const bedtimeStart = getOptionalString(document, "bedtime_start");
        const bedtimeEnd = getOptionalString(document, "bedtime_end");
        const durationSeconds = getOptionalNumber(document, "total_sleep_duration");
        const averageHeartRate = getOptionalNumber(document, "average_heart_rate");
        const averageHrv = getOptionalNumber(document, "average_hrv");
        const sleepType = getOptionalString(document, "type");
        if (bedtimeStart !== undefined) record.bedtimeStart = bedtimeStart;
        if (bedtimeEnd !== undefined) record.bedtimeEnd = bedtimeEnd;
        if (durationSeconds !== undefined) record.durationSeconds = durationSeconds;
        if (averageHeartRate !== undefined) record.averageHeartRate = averageHeartRate;
        if (averageHrv !== undefined) record.averageHrv = averageHrv;
        if (sleepType !== undefined) record.sleepType = sleepType;
    }

    return record;
};

export const getOuraRecordKey = (record: BaseRecord): string | undefined => {
    if (record.type !== OuraType) return undefined;
    const ouraRecord = record as OuraRecord;
    return `${ouraRecord.dataType}:${ouraRecord.id}`;
};

const getPositiveInteger = (value: number | undefined, fallback: number, field: string): number => {
    if (value === undefined) return fallback;
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${field} must be a positive integer`);
    }
    return value;
};

const formatDateInTimeZone = (date: Date, timeZone: string): string => {
    let parts: Intl.DateTimeFormatPart[];
    try {
        parts = new Intl.DateTimeFormat("en-US", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            timeZone,
        }).formatToParts(date);
    } catch {
        throw new Error(`oura_timezone is not a valid IANA timezone: ${timeZone}`);
    }

    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
};

const shiftIsoDate = (date: string, days: number): string | null => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const parsed = new Date(`${date}T12:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return null;
    parsed.setUTCDate(parsed.getUTCDate() + days);
    return parsed.toISOString().slice(0, 10);
};

const getDateRange = (
    env: OuraEnv,
    lastRecord: BaseRecord | null,
    now: Date,
): { startDate: string; endDate: string } => {
    const historyDays = getPositiveInteger(env.oura_history_days, DEFAULT_HISTORY_DAYS, "oura_history_days");
    const lookbackDays = getPositiveInteger(env.oura_lookback_days, DEFAULT_LOOKBACK_DAYS, "oura_lookback_days");
    const timeZone = env.oura_timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
    const endDate = formatDateInTimeZone(now, timeZone);

    if (lastRecord) {
        const lastDay = (lastRecord as Partial<OuraRecord>).day;
        if (typeof lastDay === "string") {
            const shifted = shiftIsoDate(lastDay, -lookbackDays);
            if (shifted) return { startDate: shifted, endDate };
        }
        const fromLastRecord = new Date(lastRecord.unixTimeMs - lookbackDays * DAY_MS);
        return { startDate: formatDateInTimeZone(fromLastRecord, timeZone), endDate };
    }

    const historyStart = new Date(now.getTime() - (historyDays - 1) * DAY_MS);
    return { startDate: formatDateInTimeZone(historyStart, timeZone), endDate };
};

const getTokenCachePath = (env: OuraEnv, cacheDirOverride?: string): string => {
    const cacheDir = cacheDirOverride
        ?? process.env.OURA_TOKEN_CACHE_DIR
        ?? path.join(process.cwd(), ".oura-token-cache");
    const credentialSeed = env.oura_refresh_token ?? env.oura_access_token;
    const fingerprint = createHash("sha256")
        .update(`${env.oura_client_id ?? ""}\0${credentialSeed}`)
        .digest("hex")
        .slice(0, 12);
    // Key OAuth state by credential, not output name. Multiple Oura entries can
    // safely share one rotated token without racing the single-use refresh token.
    return path.join(cacheDir, `oura-oauth-${fingerprint}.json`);
};

const isFileNotFoundError = (error: unknown): boolean => {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
};

const ensureTokenCacheDirectory = async (cachePath: string): Promise<void> => {
    const directory = path.dirname(cachePath);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await fs.chmod(directory, 0o700);
};

const syncDirectory = async (directory: string): Promise<void> => {
    const directoryHandle = await fs.open(directory, "r");
    try {
        await directoryHandle.sync();
    } finally {
        await directoryHandle.close();
    }
};

const readTokenState = async (cachePath: string): Promise<OuraTokenState | null> => {
    let stats;
    try {
        stats = await fs.lstat(cachePath);
    } catch (error) {
        if (isFileNotFoundError(error)) return null;
        throw new Error(`Failed to inspect Oura OAuth token cache: ${(error as Error).message}`);
    }
    if (!stats.isFile()) {
        throw new Error(`Oura OAuth token cache is not a regular file: ${cachePath}`);
    }
    if ((stats.mode & 0o077) !== 0) {
        throw new Error(`Oura OAuth token cache permissions must be 0600: ${cachePath}`);
    }
    if (typeof process.getuid === "function" && stats.uid !== process.getuid()) {
        throw new Error(`Oura OAuth token cache is not owned by the current user: ${cachePath}`);
    }

    let text: string;
    try {
        text = await fs.readFile(cachePath, "utf-8");
    } catch (error) {
        throw new Error(`Failed to read Oura OAuth token cache: ${(error as Error).message}`);
    }

    try {
        const value = JSON.parse(text) as Partial<OuraTokenState> | null;
        if (value === null || typeof value !== "object") throw new Error("root value must be an object");
        if (value.version !== 1) throw new Error("unsupported cache version");
        if (!isNonEmptyString(value.accessToken)) throw new Error("accessToken is missing");
        if (!isNonEmptyString(value.refreshToken)) throw new Error("refreshToken is missing");
        if (value.expiresAt !== undefined && (!Number.isFinite(value.expiresAt) || value.expiresAt <= 0)) {
            throw new Error("expiresAt is invalid");
        }
        return value as OuraTokenState;
    } catch (error) {
        throw new Error(`Oura OAuth token cache is invalid (${cachePath}): ${(error as Error).message}`);
    }
};

const writeTokenState = async (cachePath: string, state: OuraTokenState): Promise<void> => {
    await ensureTokenCacheDirectory(cachePath);
    const temporaryPath = `${cachePath}.${randomUUID()}.tmp`;
    let fileHandle: fs.FileHandle | undefined;
    try {
        fileHandle = await fs.open(temporaryPath, "wx", 0o600);
        await fileHandle.chmod(0o600);
        await fileHandle.writeFile(JSON.stringify(state) + "\n", "utf-8");
        await fileHandle.sync();
        await fileHandle.close();
        fileHandle = undefined;
        await fs.rename(temporaryPath, cachePath);
        await fs.chmod(cachePath, 0o600);

        await syncDirectory(path.dirname(cachePath));
    } catch (error) {
        await fileHandle?.close().catch(() => undefined);
        await fs.rm(temporaryPath, { force: true });
        throw new Error(`Failed to persist refreshed Oura OAuth tokens: ${(error as Error).message}`);
    }
};

const sleep = (milliseconds: number): Promise<void> => {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
};

type RefreshLockOwner = {
    pid: number;
    hostname: string;
    createdAt: string;
};

const removeStaleRefreshLock = async (lockPath: string): Promise<boolean> => {
    let stats;
    let owner: Partial<RefreshLockOwner> | null = null;
    try {
        stats = await fs.lstat(lockPath);
        owner = JSON.parse(await fs.readFile(lockPath, "utf-8")) as Partial<RefreshLockOwner>;
    } catch (error) {
        if (isFileNotFoundError(error)) return true;
        try {
            stats ??= await fs.lstat(lockPath);
        } catch (statError) {
            if (isFileNotFoundError(statError)) return true;
            return false;
        }
    }

    let isStale = false;
    if (owner?.hostname === hostname() && Number.isInteger(owner.pid) && (owner.pid as number) > 0) {
        try {
            process.kill(owner.pid as number, 0);
        } catch (error) {
            isStale = (error as NodeJS.ErrnoException).code === "ESRCH";
        }
    } else if (owner === null && Date.now() - stats.mtimeMs > 10_000) {
        // A valid owner writes and fsyncs metadata before any refresh request.
        // An old empty/malformed lock therefore comes from a pre-request crash.
        isStale = true;
    }

    if (!isStale) return false;
    await fs.rm(lockPath, { force: true });
    await syncDirectory(path.dirname(lockPath));
    return true;
};

const acquireRefreshLock = async (cachePath: string): Promise<() => Promise<void>> => {
    await ensureTokenCacheDirectory(cachePath);
    const lockPath = `${cachePath}.lock`;
    for (let attempt = 0; attempt < 100; attempt++) {
        try {
            const handle = await fs.open(lockPath, "wx", 0o600);
            try {
                const owner: RefreshLockOwner = {
                    pid: process.pid,
                    hostname: hostname(),
                    createdAt: new Date().toISOString(),
                };
                await handle.chmod(0o600);
                await handle.writeFile(JSON.stringify(owner) + "\n", "utf-8");
                await handle.sync();
                await syncDirectory(path.dirname(lockPath));
            } catch (error) {
                await handle.close();
                await fs.rm(lockPath, { force: true });
                throw error;
            }
            let released = false;
            return async () => {
                if (released) return;
                released = true;
                await handle.close();
                await fs.rm(lockPath, { force: true });
                await syncDirectory(path.dirname(lockPath));
            };
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
                throw new Error(`Failed to lock Oura OAuth token cache: ${(error as Error).message}`);
            }
            if (await removeStaleRefreshLock(lockPath)) continue;
            await sleep(100);
        }
    }
    throw new Error(`Timed out waiting for Oura OAuth token refresh lock: ${lockPath}`);
};

const assertNoUncertainRefresh = async (cachePath: string): Promise<void> => {
    const markerPath = `${cachePath}.refresh-uncertain`;
    try {
        await fs.lstat(markerPath);
    } catch (error) {
        if (isFileNotFoundError(error)) return;
        throw new Error(`Failed to inspect Oura OAuth refresh state: ${(error as Error).message}`);
    }
    throw new Error(
        "A previous Oura OAuth refresh did not complete safely; reauthorize Oura and replace the configured tokens before retrying",
    );
};

const createUncertainRefreshMarker = async (cachePath: string): Promise<string> => {
    await ensureTokenCacheDirectory(cachePath);
    const markerPath = `${cachePath}.refresh-uncertain`;
    const handle = await fs.open(markerPath, "wx", 0o600);
    try {
        await handle.chmod(0o600);
        await handle.writeFile(new Date().toISOString() + "\n", "utf-8");
        await handle.sync();
    } finally {
        await handle.close();
    }
    await syncDirectory(path.dirname(cachePath));
    return markerPath;
};

type OuraTokenStore = {
    kind: "file" | "1password";
    read: () => Promise<OuraTokenState | null>;
    markRefreshUncertain: () => Promise<void>;
    write: (state: OuraTokenState) => Promise<void>;
    acquireRefreshLock: () => Promise<() => Promise<void>>;
};

const inProcessRefreshLockTails = new Map<string, Promise<void>>();

const acquireInProcessRefreshLock = async (key: string): Promise<() => Promise<void>> => {
    const previous = inProcessRefreshLockTails.get(key) ?? Promise.resolve();
    let releaseCurrent!: () => void;
    const current = new Promise<void>((resolve) => {
        releaseCurrent = resolve;
    });
    const tail = previous.then(() => current);
    inProcessRefreshLockTails.set(key, tail);
    await previous;

    let released = false;
    return async () => {
        if (released) return;
        released = true;
        releaseCurrent();
        if (inProcessRefreshLockTails.get(key) === tail) {
            inProcessRefreshLockTails.delete(key);
        }
    };
};

const getOnePasswordConfig = (env: OuraEnv): OuraOnePasswordConfig | null => {
    const store = env.oura_token_store ?? "file";
    if (store !== "file" && store !== "1password") {
        throw new Error(`Unsupported Oura token store: ${String(store)}`);
    }
    if (store === "file") {
        if (env.oura_1password_vault !== undefined || env.oura_1password_item !== undefined) {
            throw new Error("Set oura_token_store to '1password' when configuring a 1Password vault or item");
        }
        return null;
    }
    if (!isNonEmptyString(env.oura_1password_vault) || !isNonEmptyString(env.oura_1password_item)) {
        throw new Error("oura_1password_vault and oura_1password_item are required for the 1Password token store");
    }
    return {
        vault: env.oura_1password_vault,
        item: env.oura_1password_item,
    };
};

const createTokenStore = (
    env: OuraEnv,
    dependencies: FetchOuraDependencies,
): OuraTokenStore => {
    const onePasswordConfig = getOnePasswordConfig(env);
    if (onePasswordConfig) {
        const runner = dependencies.onePasswordCommandRunner;
        const lockKey = `${onePasswordConfig.vault}\0${onePasswordConfig.item}`;
        return {
            kind: "1password",
            read: () => readOuraOnePasswordTokenState(onePasswordConfig, runner),
            markRefreshUncertain: () => markOuraOnePasswordRefreshUncertain(onePasswordConfig, runner),
            write: (state) => writeOuraOnePasswordTokenState(onePasswordConfig, state, runner),
            acquireRefreshLock: () => acquireInProcessRefreshLock(lockKey),
        };
    }

    const cachePath = getTokenCachePath(env, dependencies.cacheDir);
    const uncertainMarkerPath = `${cachePath}.refresh-uncertain`;
    return {
        kind: "file",
        read: async () => {
            await assertNoUncertainRefresh(cachePath);
            return readTokenState(cachePath);
        },
        markRefreshUncertain: async () => {
            await createUncertainRefreshMarker(cachePath);
        },
        write: async (state) => {
            await writeTokenState(cachePath, state);
            await fs.rm(uncertainMarkerPath);
        },
        acquireRefreshLock: () => acquireRefreshLock(cachePath),
    };
};

const redactSecrets = (value: string, secrets: Array<string | undefined>): string => {
    return secrets
        .filter(isNonEmptyString)
        .reduce((redacted, secret) => redacted.replaceAll(secret, "[REDACTED]"), value);
};

const describeErrorResponse = async (response: Response): Promise<string> => {
    const text = await response.text();
    if (!text) return "";
    try {
        const body = JSON.parse(text) as Record<string, unknown>;
        const detail = body.error_description ?? body.detail ?? body.title;
        if (typeof detail === "string") return detail;
        if (detail !== undefined) return JSON.stringify(detail).slice(0, 500);
    } catch {
        // Fall back to the response body below.
    }
    return text.slice(0, 500);
};

const responseStatus = (response: Response): string => {
    return response.statusText ? `${response.status} ${response.statusText}` : String(response.status);
};

const getRefreshCredentials = (env: OuraEnv, state: OuraTokenState): {
    refreshToken: string;
    clientId: string;
    clientSecret: string;
} | null => {
    const refreshToken = state.refreshToken ?? env.oura_refresh_token;
    const values = [refreshToken, env.oura_client_id, env.oura_client_secret];
    const configuredCount = values.filter(isNonEmptyString).length;
    if (configuredCount === 0) return null;
    if (configuredCount !== values.length) {
        throw new Error("Oura refresh token state, oura_client_id, and oura_client_secret must be configured together");
    }
    return {
        refreshToken: refreshToken as string,
        clientId: env.oura_client_id as string,
        clientSecret: env.oura_client_secret as string,
    };
};

const createOuraRequester = async (
    env: OuraEnv,
    dependencies: FetchOuraDependencies,
): Promise<(url: URL) => Promise<Response>> => {
    const tokenStore = createTokenStore(env, dependencies);
    const storedState = await tokenStore.read();
    if (!storedState && !isNonEmptyString(env.oura_access_token)) {
        throw new Error("oura_access_token is required when the token store has no state");
    }
    let tokenState: OuraTokenState = storedState ?? {
        version: 1,
        accessToken: env.oura_access_token as string,
        refreshToken: env.oura_refresh_token,
    };
    const refreshCredentials = getRefreshCredentials(env, tokenState);
    if (
        process.env.GITHUB_ACTIONS === "true"
        && refreshCredentials
        && tokenStore.kind === "file"
        && dependencies.cacheDir === undefined
        && !isNonEmptyString(process.env.OURA_TOKEN_CACHE_DIR)
    ) {
        throw new Error(
            "Oura OAuth refresh on GitHub Actions requires an explicit durable OURA_TOKEN_CACHE_DIR outside Actions cache",
        );
    }
    let hasRefreshed = false;

    const refresh = async (): Promise<void> => {
        if (!refreshCredentials) {
            throw new Error("Oura access token expired and refresh credentials are not configured");
        }
        if (Boolean(process.env.CHRONIXD_DRY_RUN)) {
            throw new Error("Oura OAuth token refresh is disabled in CHRONIXD_DRY_RUN because refresh tokens are single-use");
        }

        const releaseLock = await tokenStore.acquireRefreshLock();
        try {
            const latestState = await tokenStore.read();
            if (latestState && latestState.accessToken !== tokenState.accessToken) {
                tokenState = latestState;
                hasRefreshed = true;
                return;
            }

            const latestRefreshCredentials = getRefreshCredentials(env, tokenState);
            if (!latestRefreshCredentials) {
                throw new Error("Oura access token expired and refresh credentials are not configured");
            }
            const refreshToken = latestRefreshCredentials.refreshToken;
            const secrets = [
                tokenState.accessToken,
                refreshToken,
                latestRefreshCredentials.clientId,
                latestRefreshCredentials.clientSecret,
            ];
            const body = new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: refreshToken,
                client_id: latestRefreshCredentials.clientId,
                client_secret: latestRefreshCredentials.clientSecret,
            });
            await tokenStore.markRefreshUncertain();
            let response: Response;
            try {
                response = await fetchWithRetry(OURA_TOKEN_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body,
                }, {
                    // Oura refresh tokens are single-use. If the server processed a request
                    // but the response was lost, retrying the same token can destroy recovery.
                    maxRetries: 0,
                });
            } catch (error) {
                const detail = redactSecrets((error as Error).message, secrets);
                throw new Error(
                    `Failed to refresh Oura OAuth token: request outcome is unknown; reauthorize before retrying (${detail})`,
                );
            }
            if (!response.ok) {
                const detail = redactSecrets(await describeErrorResponse(response), secrets);
                throw new Error(`Failed to refresh Oura OAuth token: ${responseStatus(response)}${detail ? `: ${detail}` : ""}; reauthorize before retrying`);
            }

            const tokens = (await response.json()) as Partial<OuraTokenResponse>;
            if (!isNonEmptyString(tokens.access_token) || !isNonEmptyString(tokens.refresh_token)) {
                throw new Error("Failed to refresh Oura OAuth token: response did not include rotated access and refresh tokens; reauthorize before retrying");
            }
            tokenState = {
                version: 1,
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                expiresAt: typeof tokens.expires_in === "number"
                    ? Date.now() + tokens.expires_in * 1000
                    : undefined,
            };
            await tokenStore.write(tokenState);
            hasRefreshed = true;
            logger.info("Refreshed Oura OAuth token");
        } finally {
            await releaseLock();
        }
    };

    const request = async (url: URL): Promise<Response> => {
        const execute = () => fetchWithRetry(url, {
            headers: { Authorization: `Bearer ${tokenState.accessToken}` },
        });
        let response = await execute();
        if (response.status === 401 && !hasRefreshed) {
            await refresh();
            response = await execute();
        }
        return response;
    };

    return request;
};

const getConfiguredDataTypes = (env: OuraEnv): OuraDataType[] => {
    const dataTypes = env.oura_data_types ?? [...OURA_DATA_TYPES];
    if (!Array.isArray(dataTypes) || dataTypes.length === 0) {
        throw new Error("oura_data_types must be a non-empty array");
    }
    for (const dataType of dataTypes) {
        if (!isOuraDataType(dataType)) {
            throw new Error(`Unsupported Oura data type: ${String(dataType)}`);
        }
    }
    return [...new Set(dataTypes)];
};

export const fetchOura = async (
    env: OuraEnv,
    lastRecord: BaseRecord | null,
    options: FetchOptions,
    dependencies: FetchOuraDependencies = {},
): Promise<OuraRecord[]> => {
    const limit = Math.floor(options.limit);
    if (!Number.isFinite(limit) || limit <= 0) return [];

    const now = dependencies.now ?? new Date();
    const { startDate, endDate } = getDateRange(env, lastRecord, now);
    const dataTypes = getConfiguredDataTypes(env);
    if (limit < dataTypes.length) {
        throw new Error(`Oura limit must be at least ${dataTypes.length} to collect every configured data type`);
    }
    const request = await createOuraRequester(env, dependencies);
    const recordsByKey = new Map<string, OuraRecord>();
    const recordsByDataType: OuraRecord[][] = [];

    logger.info("Fetching Oura data from %s to %s", startDate, endDate);

    for (const dataType of dataTypes) {
        let nextToken: string | undefined;
        const seenTokens = new Set<string>();
        const recordsForDataType = new Map<string, OuraRecord>();

        do {
            const url = new URL(`${OURA_API_BASE_URL}/${dataType}`);
            url.searchParams.set("start_date", startDate);
            url.searchParams.set("end_date", endDate);
            if (nextToken) url.searchParams.set("next_token", nextToken);

            const response = await request(url);
            if (!response.ok) {
                const detail = await describeErrorResponse(response);
                const message = `Failed to fetch Oura ${dataType}: ${responseStatus(response)}${detail ? `: ${detail}` : ""}`;
                if (response.status === 429) throw new RateLimitError(message);
                throw new Error(message);
            }

            const body = (await response.json()) as Partial<OuraCollectionResponse>;
            if (!Array.isArray(body.data)) {
                throw new Error(`Failed to fetch Oura ${dataType}: response data is not an array`);
            }

            for (const document of body.data) {
                const record = convertOuraDocument(dataType, document);
                recordsForDataType.set(getOuraRecordKey(record) as string, record);
            }

            nextToken = isNonEmptyString(body.next_token) ? body.next_token : undefined;
            if (nextToken) {
                if (seenTokens.has(nextToken)) {
                    throw new Error(`Failed to fetch Oura ${dataType}: repeated next_token`);
                }
                seenTokens.add(nextToken);
            }
        } while (nextToken);

        recordsByDataType.push(
            [...recordsForDataType.values()].toSorted((a, b) => b.unixTimeMs - a.unixTimeMs),
        );
    }

    // Allocate the service-wide limit round-robin. This guarantees every
    // configured type a fair chance, while unused shares flow to types that
    // actually have more documents (notably multiple sleep periods per day).
    const selectedCounts = recordsByDataType.map(() => 0);
    let remaining = limit;
    while (remaining > 0) {
        let selectedInRound = false;
        for (const [index, records] of recordsByDataType.entries()) {
            if (selectedCounts[index] >= records.length) continue;
            selectedCounts[index] += 1;
            remaining -= 1;
            selectedInRound = true;
            if (remaining === 0) break;
        }
        if (!selectedInRound) break;
    }

    for (const [index, count] of selectedCounts.entries()) {
        for (const record of recordsByDataType[index].slice(0, count)) {
            recordsByKey.set(getOuraRecordKey(record) as string, record);
        }
    }

    return [...recordsByKey.values()];
};

export const ouraService: ServiceDefinition = {
    writeMode: "upsert",
    isEnv: isOuraEnv,
    getRecordKey: getOuraRecordKey,
    fetch: (env, lastRecord, options) => fetchOura(env, lastRecord, options),
};
