/**
 * A regular expression for a glob of paths with `/`: `**` for any folders,
 * `*` and `?` in one name, and `{a,b}` for one of the alternatives.
 */
export function globRegExp(glob: string): RegExp {
  let re = "";
  let braces = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      i++;
      if (glob[i + 1] === "/") {
        // `**/` is no folder or any folders.
        i++;
        re += "(?:.*/)?";
      } else {
        re += ".*";
      }
    } else if (c === "*") {
      re += "[^/]*";
    } else if (c === "?") {
      re += "[^/]";
    } else if (c === "{") {
      braces++;
      re += "(?:";
    } else if (c === "}" && braces) {
      braces--;
      re += ")";
    } else if (c === "," && braces) {
      re += "|";
    } else {
      re += c.replace(/[.+^$()|[\]\\{}]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`);
}
