
import * as RootLog from "loglevel";
import * as Url from "url";
import * as Path from "path";
import * as Viz from "viz.js";
import * as Marked from "marked";
import Repo from "./Repo";
import Utils from "./Utils";

const Log = RootLog.getLogger("dox.Doc");


export default class Doc {
  private child_docs: any;
  private is_directory: boolean;
  private parent_doc?: Doc;
  private path: string;
  private promise: Promise<string>;
  private repo: Repo;


  constructor (repo: Repo, path: string, parent_doc: Doc) {
    this.child_docs = {};
    this.parent_doc = parent_doc;
    this.repo = repo;
    if (Path.basename(path) === "README.md") {
      path = Path.resolve(path, "..");
    }
    path = Path.normalize(path);
    const extname = Path.extname(path);
    if (path.charAt(0) !== "/") {
      throw new Error(`path must begin with '/': ${path}`);
    }
    if (extname !== ".md" && extname !== "") {
      throw new Error(`Doc seems neither a directory nor a markdown file: ${path}`);
    }
    this.path = path;
    this.is_directory = (extname === "");
  }


  public createChildDoc(dirname: string) {
    if (this.child_docs[dirname]) {
      throw new Error(`child doc ${dirname} already exists`);
    }
    this.child_docs[dirname] = new Doc(this.repo, this.path + "/" + dirname, this);
    return this.child_docs[dirname];
  }


  public getChildDoc(dirname: string) {
    return this.child_docs[dirname];
  }


  public getFullPathFromRelative(path: string): string {
    if (!this.is_directory) {
      path = "../" + path;
    }
    return Path.resolve(this.path, path);
  }


  public getHash(path?: string): string {
    return this.repo.getHash() + "&path=" + (path || this.path);
  }


  public getName(): string {
    return Path.basename(this.path);
  }


  public getParentDoc(): Doc {
    return this.parent_doc;
  }


  public getPath(): string {
    return this.path;
  }


  public getPromiseHTML(highlight_link_path?: string): Promise<string> {
    const that = this;
    return this.getPromiseMarkdown()
      .then(function (doc_obj: string) {
        return that.convertDocumentContent(doc_obj, highlight_link_path);
      });
}


  public getPromiseMarkdown(): Promise<string> {
    if (!this.promise) {
      this.load();
    }
    return this.promise;
  }


  public getRepo(): Repo {
    return this.repo;
  }


  public getSourceFileURL(): string {
    var out = this.path;
    if (this.is_directory) {
      out += "/README.md";
    }
    return Path.normalize(out);
  }


  private load() {
    const file_url = this.getSourceFileURL();
    Log.debug("Doc.load() getting: " + file_url);
    this.promise = this.repo.getPromise()
      .then(function (store) {
        return store.getDoc(file_url) as Promise<string>;
      });
  }


  private convertDocumentContent(markdown: string, highlight_link_path?: string): string {
    var html;
    const digraph_blocks = [];
    markdown = this.convertRelativePaths(markdown, highlight_link_path);
    markdown = this.separateOutDigraphBlocks(markdown, digraph_blocks);
    html = this.convertMarkdownToHTML(markdown);
    html = this.applyViz(html, digraph_blocks);
    return html;
  }


  // only INLINE markdown links are converted as relative URLs
  private convertRelativePaths(markdown: string, highlight_link_path?: string): string {
    const that = this;
    return markdown.replace(/\[(.*)\]\((.*?)\)/g, function (match_all, match_1, match_2) {
      Log.debug("convertRelativePaths() match: " + match_1 + ", " + match_2);
      if (that.isURLNeedingConversion(match_2)) {
        return that.convertURL(match_2, match_1, highlight_link_path);
      }
      return "[" + match_1 + "](" + match_2 + ")";
    });
  }


  private isURLNeedingConversion(href: string): boolean {
    Log.debug("convertRelativePath(" + href + ") tests: "
      + Path.isAbsolute(href) + ", "
      + Utils.appearsToBeAFile(href) + ", "
      + Utils.isMarkdownFile(href));

    return (!Path.isAbsolute(href)
        && (!Utils.appearsToBeAFile(href)
          || Utils.isMarkdownFile(href)));
  }


  private convertURL(href: string, label: string, highlight_link_path?: string): string {
    var full_path = this.getFullPathFromRelative(href);
    var out = "[" + label + "](" + this.getHash(full_path) + ")";

    Log.debug("convertURL(" + href + "): " + full_path);
    if (highlight_link_path) {
      Log.debug("highlight_link path: " + highlight_link_path);
      if (highlight_link_path === full_path) {
        out = "**" + out + "**";
      }
    }
    return out;
  }


  private convertMarkdownToHTML(markdown: string): string {
    return Marked(markdown, { smartypants: true, });
  }


  private separateOutDigraphBlocks(markdown: string, digraph_blocks: Array<string>): string {
    const lines = markdown.split("\n");
    var out = "";
    var block_number = 0;

    Log.trace("separateOutDigraphBlocks() lines: " + lines.length);
    for (let i = 0; i < lines.length; i += 1) {
      if (!digraph_blocks[block_number]) {
        if (lines[i].indexOf("digraph") === 0) {
          digraph_blocks[block_number] = lines[i];
        } else {
          out += "\n" + lines[i];
        }
      } else {
        digraph_blocks[block_number] += "\n" + lines[i];
        if (lines[i].indexOf("}") > -1) {
          out += "\n¬¬DIGRAPH<" + block_number + ">¬¬"
          block_number += 1;
        }
      }
    }
    Log.trace("separateOutDigraphBlocks() out: " + lines.length
      + ", blocks: " + block_number + ", out: " + out);
    return out;
  }


  private applyViz(html: string, digraph_blocks: Array<string>): string {
    const that = this;
    Log.trace("applyViz() : " + digraph_blocks.length);
    return html.replace(/¬¬DIGRAPH<(\d+)>¬¬/, function (match, match_1) {
      const block_number = parseInt(match_1);
      Log.trace("block_number: " + block_number);
      try {
        if (!digraph_blocks[block_number]) {
          throw new Error("no digraph block found for " + block_number);
        }
        return Viz(digraph_blocks[block_number], "svg");
      } catch (e) {
        return "<p><b>Error in Viz: " + e.toString() + "</b></p>";
      }
    });
  }


}