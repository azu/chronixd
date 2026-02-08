/* eslint-disable no-console */
import { isInsideLogBuffer, pushToLogBuffer } from "./buffered-logger.js";

export const info = (message?: any, ...optionalParams: any[]) => {
    if (!pushToLogBuffer("info", [message, ...optionalParams])) {
        console.info(message, ...optionalParams);
    }
}
export const warn = (message?: any, ...optionalParams: any[]) => {
    if (!pushToLogBuffer("warn", [message, ...optionalParams])) {
        console.warn(message, ...optionalParams);
    }
}
export const errorLog = (message?: any, ...optionalParams: any[]) => {
    if (!pushToLogBuffer("error", [message, ...optionalParams])) {
        console.error(message, ...optionalParams);
    }
}
export const debug = (message?: any, ...optionalParams: any[]) => {
    if (process.env.DEBUG === undefined) {
        return;
    }
    if (!pushToLogBuffer("debug", [message, ...optionalParams])) {
        console.debug(message, ...optionalParams);
    }
}

export const createLogger = (name: string) => {
    return {
        info: (message?: any, ...optionalParams: any[]) => {
            if (isInsideLogBuffer()) {
                info(message, ...optionalParams);
            } else {
                info(`[${name}]`, message, ...optionalParams);
            }
        },
        warn: (message?: any, ...optionalParams: any[]) => {
            if (isInsideLogBuffer()) {
                warn(message, ...optionalParams);
            } else {
                warn(`[${name}]`, message, ...optionalParams);
            }
        },
        error: (message?: any, ...optionalParams: any[]) => {
            if (isInsideLogBuffer()) {
                errorLog(message, ...optionalParams);
            } else {
                errorLog(`[${name}]`, message, ...optionalParams);
            }
        },
        debug: (message?: any, ...optionalParams: any[]) => {
            if (isInsideLogBuffer()) {
                debug(message, ...optionalParams);
            } else {
                debug(`[${name}]`, message, ...optionalParams);
            }
        }
    }
}
