import { describe, test, expect } from "bun:test";
import { jsx, jsxs, Fragment } from "./jsx-runtime.js";

// Helper: coerce branded RawHtml to plain string for assertion
const str = (v: unknown): string => String(v);

describe("jsx-runtime", () => {
    test("renders a simple element", () => {
        expect(str(jsx("div", { class: "test", children: "hello" }))).toBe('<div class="test">hello</div>');
    });

    test("renders void elements without closing tag", () => {
        expect(str(jsx("br", {}))).toBe("<br>");
    });

    test("renders img with attributes", () => {
        expect(str(jsx("img", { src: "test.png", alt: "photo" }))).toBe('<img src="test.png" alt="photo">');
    });

    test("escapes HTML in attribute values", () => {
        expect(str(jsx("a", { href: "test?a=1&b=2", children: "link" }))).toBe('<a href="test?a=1&amp;b=2">link</a>');
    });

    test("escapes HTML special characters in attributes", () => {
        const result = jsx("div", { title: '<script>alert("xss")</script>', children: "safe" });
        expect(str(result)).toBe('<div title="&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;">safe</div>');
    });

    test("escapes HTML in plain text children", () => {
        expect(str(jsx("div", { children: '<script>alert("xss")</script>' }))).toBe(
            "<div>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</div>"
        );
    });

    test("does NOT double-escape JSX children (branded RawHtml)", () => {
        const inner = jsx("span", { children: "inner" });
        const result = jsx("div", { children: inner });
        expect(str(result)).toBe("<div><span>inner</span></div>");
    });

    test("renders boolean true attributes", () => {
        expect(str(jsx("input", { required: true, disabled: true }))).toBe("<input required disabled>");
    });

    test("skips false and null attributes", () => {
        expect(str(jsx("div", { class: null, id: false, children: "content" }))).toBe("<div>content</div>");
    });

    test("escapes plain strings in array children", () => {
        expect(str(jsxs("div", { children: ["a & b", " < c"] }))).toBe("<div>a &amp; b &lt; c</div>");
    });

    test("mixed JSX and text in array children", () => {
        const result = jsxs("div", { children: [
            jsx("b", { children: "bold" }),
            " & text",
        ]});
        expect(str(result)).toBe("<div><b>bold</b> &amp; text</div>");
    });

    test("renders numeric children", () => {
        expect(str(jsx("span", { children: 42 }))).toBe("<span>42</span>");
    });

    test("skips null/undefined/boolean children", () => {
        expect(str(jsxs("div", { children: [null, undefined, false, true, "text"] }))).toBe("<div>text</div>");
    });

    test("Fragment renders children only", () => {
        expect(str(Fragment({ children: ["a", "b", "c"] }))).toBe("abc");
    });

    test("dangerouslySetInnerHTML renders raw HTML", () => {
        expect(str(jsx("div", { dangerouslySetInnerHTML: { __html: "<b>bold</b>" } }))).toBe("<div><b>bold</b></div>");
    });

    test("renders component functions", () => {
        const MyComp = (props: Record<string, unknown>) => {
            return jsx("p", { children: props.name as string });
        };
        expect(str(jsx(MyComp, { name: "test" }))).toBe("<p>test</p>");
    });
});
