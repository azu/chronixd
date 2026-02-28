export declare function jsx(tag: string | ((props: Record<string, unknown>) => string), props: Record<string, unknown> | null): string;
export declare function jsxs(tag: string | ((props: Record<string, unknown>) => string), props: Record<string, unknown> | null): string;
export declare function Fragment(props: { children?: unknown }): string;

export declare namespace JSX {
    type Element = string;
    interface IntrinsicElements {
        [elemName: string]: Record<string, unknown>;
    }
}
