export function strip_html_block(text, tag) {
  let open = text.indexOf("<" + tag);
  let close = text.indexOf("</" + tag + ">");

  // The tag is required to exist opening and closing at least once
  if (open === -1 || close === -1) {
    return text;
  }

  let new_text_first_half = text.substring(0, open);
  let new_text_second_half = text.substring(close + tag.length + 3);
  let new_text = new_text_first_half + new_text_second_half;

  if (new_text.indexOf("<" + tag) === -1 &&
    new_text.indexOf("</" + tag + ">") === -1) {
    return new_text;
    //Regular occurrence of opening tag before closing tag
  } else if (open < close) {
    return strip_html_block(new_text, tag);
    //First occurrence of opening tag is after closing tag
  } else if (open > close) {
    new_text_first_half = new_text.substring(0, close);
    new_text_second_half = new_text.substring(open + tag.length + 1);
    new_text = new_text_first_half + new_text_second_half;

    return strip_html_block(new_text, tag);
  } else {
    //Only either closing or opening tag found, can't work with this, return
    return text;
  }
}