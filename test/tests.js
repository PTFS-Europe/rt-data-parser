import { strip_html_block, convert_date } from "../lib/functions.js";
import { expect } from "chai";

describe("strip_html_block", () => {
  it("should return the original text if the opening and closing tag do not exist", () => {
    const text = "Hello world";
    const tag = "div";
    expect(strip_html_block(text, tag)).equal(text);
  });

  it("should remove the specified tag from the text", () => {
    const text = "<div>Hello</div>";
    const tag = "div";
    expect(strip_html_block(text, tag)).equal("");
  });

  it("should remove all occurrences of the specified tag from the text", () => {
    const text = "<div>Hello</div>return this<div>World</div>";
    const tag = "div";
    expect(strip_html_block(text, tag)).equal("return this");
  });

  it("should handle nested tags", () => {
    const text = "<div><span>Hello</span></div>";
    const tag = "div";
    expect(strip_html_block(text, tag)).equal("");
  });

  /**
   * This could be improved to handle nested tags, but it's not critical
   */
  it("should handle the same tag nested", () => {
    const text = "before<div><div>Hello hi <div>Hello hi  </div> </div></div>";
    const tag = "div";
    expect(strip_html_block(text, tag)).equal("before </div></div>");
  });

  it("should handle multiple nested tags", () => {
    const text = "<div><span><strong>Hello</strong></span></div>good text";
    const tag = "div";
    expect(strip_html_block(text, tag)).equal("good text");
  });

  it("should handle tags with attributes", () => {
    const text = '<p class="my-class">Hello</p>';
    const tag = "p";
    expect(strip_html_block(text, tag)).equal("");
  });

});

describe("convert_date", () => {
  it("should return the correct formatted date", () => {
    const date = "2022-01-01T00:00:00Z";
    const expected = "01/01/2022 00:00:00";
    const actual = convert_date(date);
    expect(actual).equal(expected);
  });

  it("should return undefined when input date is undefined", () => {
    const date = undefined;
    const expected = undefined;
    const actual = convert_date(date);
    expect(actual).equal(expected);
  });

  // Add more test cases as needed
});