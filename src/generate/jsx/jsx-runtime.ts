const VOID_ELEMENTS = new Set([
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
]);

const ESCAPE_MAP: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
};

const escapeHtml = (str: string): string => {
    return str.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
};

// Brand symbol to distinguish pre-rendered HTML from raw text
const RAW_HTML = Symbol.for("jsx.raw");

type RawHtml = string & { [RAW_HTML]: true };

const markRaw = (str: string): RawHtml => {
    const branded = new String(str) as unknown as RawHtml;
    (branded as unknown as Record<symbol, boolean>)[RAW_HTML] = true;
    return branded;
};

const isRaw = (value: unknown): boolean => {
    return typeof value === "object" && value !== null && (value as Record<symbol, boolean>)[RAW_HTML] === true;
};

type Child = string | number | boolean | null | undefined | RawHtml | Child[];

const renderChildren = (children: Child): string => {
    if (children == null || children === false || children === true) return "";
    if (typeof children === "number") return String(children);
    if (isRaw(children)) return String(children);
    if (typeof children === "string") return escapeHtml(children);
    if (Array.isArray(children)) return children.map(renderChildren).join("");
    return "";
};

type Props = Record<string, unknown> & { children?: Child; dangerouslySetInnerHTML?: { __html: string } };

type Component = (props: Props) => RawHtml;

export const jsx = (tag: string | Component, props: Props | null): RawHtml => {
    const { children, dangerouslySetInnerHTML, ...rest } = props ?? {};

    if (typeof tag === "function") {
        return tag(props ?? {});
    }

    let attrs = "";
    for (const [key, value] of Object.entries(rest)) {
        if (value == null || value === false) continue;
        if (value === true) {
            attrs += ` ${key}`;
            continue;
        }
        attrs += ` ${key}="${escapeHtml(String(value))}"`;
    }

    if (VOID_ELEMENTS.has(tag)) {
        return markRaw(`<${tag}${attrs}>`);
    }

    let inner: string;
    if (dangerouslySetInnerHTML) {
        inner = dangerouslySetInnerHTML.__html;
    } else {
        inner = renderChildren(children);
    }

    return markRaw(`<${tag}${attrs}>${inner}</${tag}>`);
};

export const jsxs = jsx;

export const Fragment = (props: Props): RawHtml => {
    return markRaw(renderChildren(props.children));
};

// JSX namespace for TypeScript
export declare namespace JSX {
    type Element = string;
    type IntrinsicElements = Record<string, Record<string, unknown>>;
}
